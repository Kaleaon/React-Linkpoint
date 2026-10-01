package app.linkpoint.viewer.world

import android.content.Context
import android.view.Choreographer
import android.view.MotionEvent
import android.view.SurfaceHolder
import android.view.SurfaceView
import app.linkpoint.core.ViewerSession
import app.linkpoint.core.scene.*
import com.google.android.filament.*
import java.util.UUID
import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.cos
import kotlin.math.sin
import kotlin.math.sqrt

/** What the 3D view reports about itself, for the overlay and diagnostics. */
data class WorldStats(
    val objectsInRegion: Int = 0,
    val drawn: Int = 0,
    val meshesPending: Int = 0,
    val meshesFailed: Int = 0,
    val sculptsSkipped: Int = 0,
    val avatars: Int = 0,
    val particles: Int = 0,
    val fps: Int = 0,
)

/**
 * Draws the region with Filament: prims and meshes from the scene store, avatar placeholders,
 * particles and a water plane. Everything runs on the main thread (Choreographer).
 *
 * NOT YET RUN ON A DEVICE. It compiles and follows Filament's documented API, but nothing here has
 * been seen on a screen; the unit-tested parts are the geometry and decoding in :core.
 */
class WorldRenderer(private val context: Context, private val session: ViewerSession, private val meshes: MeshFetcher) :
    SurfaceHolder.Callback, Choreographer.FrameCallback {

    private val engine: Engine = Engine.create(Engine.Backend.OPENGL)
    private val renderer: Renderer = engine.createRenderer()
    private val scene: Scene = engine.createScene()
    private val view: View = engine.createView()
    private val cameraEntity = EntityManager.get().create()
    private val camera: Camera = engine.createCamera(cameraEntity)
    private var swapChain: SwapChain? = null
    private val materials = Materials(engine, context)
    val lighting = Lighting()
    private val skybox: Skybox = Skybox.Builder().color(lighting.sky[0], lighting.sky[1], lighting.sky[2], 1f).build(engine)

    private class Drawn(val entity: Int, val signature: Int, val faces: List<GpuFace>) { var tx = FloatArray(16) }

    private val drawn = HashMap<Long, Drawn>()
    private val primCache = HashMap<PrimParams, List<GpuFace>>()
    private val meshCache = HashMap<UUID, List<GpuFace>>()
    private val emitters = HashMap<Long, Pair<Int, ParticleEmitter>>()
    private val tm get() = engine.transformManager
    private val rm get() = engine.renderableManager

    private var waterEntity = 0
    private var waterHeightShown = Float.NaN
    private var waterVb: VertexBuffer? = null
    private var waterIb: IndexBuffer? = null
    private var waterMi: MaterialInstance? = null
    private val particlesAlpha: ParticleBatch
    private val particlesAdd: ParticleBatch

    // Orbit camera around our avatar.
    @Volatile var yaw = 0f          // direction the camera looks, radians, 0 = +X
    @Volatile var pitch = 0.35f     // radians above the horizon the camera sits
    @Volatile var distance = 8f
    private var lastVersion = -1L
    private var lastSync = 0L
    private var lastFrame = 0L
    private var frames = 0
    private var fpsClock = 0L
    @Volatile var stats = WorldStats(); private set
    private var started = false
    private var aspect = 1.0

    init {
        view.scene = scene
        view.camera = camera
        view.isPostProcessingEnabled = false // materials already output display-ready colour
        scene.skybox = skybox
        particlesAlpha = ParticleBatch(engine, scene, materials.particle.createInstance().also { it.setParameter("uUseTexture", 0f); it.setParameter("uTexture", materials.white, materials.sampler) })
        particlesAdd = ParticleBatch(engine, scene, materials.particleAdd.createInstance().also { it.setParameter("uUseTexture", 0f); it.setParameter("uTexture", materials.white, materials.sampler) })
    }

    // ---- surface and frame loop ---------------------------------------------------------------

    fun attach(sv: SurfaceView) {
        sv.holder.addCallback(this)
        sv.setOnTouchListener(Touch())
    }

    fun start() { if (!started) { started = true; Choreographer.getInstance().postFrameCallback(this) } }
    fun stop() { started = false; Choreographer.getInstance().removeFrameCallback(this) }

    override fun surfaceCreated(holder: SurfaceHolder) { swapChain = engine.createSwapChain(holder.surface) }

    override fun surfaceChanged(holder: SurfaceHolder, format: Int, width: Int, height: Int) {
        view.viewport = Viewport(0, 0, width, height)
        aspect = width.toDouble() / height.coerceAtLeast(1)
        camera.setProjection(60.0, aspect, 0.1, 1100.0, Camera.Fov.VERTICAL)
    }

    override fun surfaceDestroyed(holder: SurfaceHolder) {
        swapChain?.let { engine.destroySwapChain(it) }
        swapChain = null
    }

    override fun doFrame(frameTimeNanos: Long) {
        if (!started) return
        Choreographer.getInstance().postFrameCallback(this)
        val sc = swapChain ?: return
        val dt = if (lastFrame == 0L) 0.016f else ((frameTimeNanos - lastFrame) / 1e9f).coerceIn(0f, 0.1f)
        lastFrame = frameTimeNanos
        update(dt, frameTimeNanos)
        if (renderer.beginFrame(sc, frameTimeNanos)) {
            renderer.render(view)
            renderer.endFrame()
        }
        frames++
        if (frameTimeNanos - fpsClock > 1_000_000_000L) { stats = stats.copy(fps = frames); frames = 0; fpsClock = frameTimeNanos }
    }

    // ---- per-frame update ---------------------------------------------------------------------

    private var targetX = 128f; private var targetY = 128f; private var targetZ = 30f
    private val camPos = FloatArray(3)

    private fun update(dt: Float, now: Long) {
        // Follow our own avatar object when the simulator is streaming it, else the handshake position.
        val me = session.selfId
        val own = me?.let { id -> session.scene.snapshot().firstOrNull { it.isAvatar && it.fullId == id } }
        val ownPos = own?.let { session.scene.worldTransform(it)?.first }
        val rp = session.region.value?.position
        if (ownPos != null) { targetX = ownPos.x; targetY = ownPos.y; targetZ = ownPos.z }
        else if (rp != null) { targetX = rp[0]; targetY = rp[1]; targetZ = rp[2] }

        val cp = cos(pitch); val sp = sin(pitch)
        val cy = cos(yaw); val sy = sin(yaw)
        val tz = targetZ + 1f
        camPos[0] = targetX - distance * cp * cy; camPos[1] = targetY - distance * cp * sy; camPos[2] = tz + distance * sp
        camera.lookAt(camPos[0].toDouble(), camPos[1].toDouble(), camPos[2].toDouble(), targetX.toDouble(), targetY.toDouble(), tz.toDouble(), 0.0, 0.0, 1.0)

        val v = session.scene.version
        if (v != lastVersion || now - lastSync > 500_000_000L) {
            lastVersion = v; lastSync = now
            syncObjects(own?.localId)
        }
        syncWater()
        stepParticles(dt)
    }

    private fun syncObjects(ownLocalId: Long?) {
        val all = session.scene.snapshot()
        val keep = HashSet<Long>()
        var avatars = 0; var pending = 0; var failed = 0; var sculpts = 0
        val candidates = ArrayList<Pair<SimObject, Triple<Vec3, Quat, Float>>>()
        for (o in all) {
            if (o.isAvatar) avatars++
            val root = session.scene.root(o) ?: continue
            // Attachments (anything parented to an avatar) need the avatar skeleton; not drawn.
            if (root.isAvatar && root.localId != o.localId) continue
            val wt = session.scene.worldTransform(o) ?: continue
            val dx = wt.first.x - camPos[0]; val dy = wt.first.y - camPos[1]; val dz = wt.first.z - camPos[2]
            val d2 = dx * dx + dy * dy + dz * dz
            if (d2 > MAX_DISTANCE * MAX_DISTANCE) continue
            candidates += o to Triple(wt.first, wt.second, d2)
        }
        candidates.sortBy { it.second.third }
        var created = 0
        var drawnCount = 0
        for ((o, t) in candidates) {
            if (drawnCount >= MAX_OBJECTS) break
            val sig = signature(o)
            var d = drawn[o.localId]
            if (d != null && d.signature != sig) { destroyDrawn(d); drawn.remove(o.localId); d = null }
            if (d == null) {
                if (created >= MAX_CREATE_PER_SYNC) { keep += o.localId; continue }
                val faces = facesFor(o)
                if (faces == null) {
                    when {
                        o.sculpt?.kind == SculptKind.MESH -> if (meshes.failure(o.sculpt!!.assetId) != null) failed++ else pending++
                        o.sculpt != null -> sculpts++
                    }
                    continue
                }
                d = buildDrawn(o, sig, faces) ?: continue
                drawn[o.localId] = d
                created++
            }
            keep += o.localId
            drawnCount++
            val scale = if (o.isAvatar) Vec3(AVATAR_WIDTH, AVATAR_WIDTH, AVATAR_HEIGHT) else o.scale
            val m = Geometry.transform(t.first.x, t.first.y, t.first.z, t.second.x, t.second.y, t.second.z, t.second.w, scale.x, scale.y, scale.z)
            if (!m.contentEquals(d.tx)) { tm.setTransform(tm.getInstance(d.entity), m); d.tx = m }
        }
        val it = drawn.entries.iterator()
        while (it.hasNext()) {
            val e = it.next()
            if (e.key !in keep) { destroyDrawn(e.value); it.remove() }
        }
        stats = stats.copy(objectsInRegion = all.size, drawn = drawn.size, meshesPending = pending, meshesFailed = failed, sculptsSkipped = sculpts, avatars = avatars)
    }

    private fun signature(o: SimObject): Int {
        var h = if (o.isAvatar) 1 else o.params.hashCode()
        h = h * 31 + (o.sculpt?.assetId?.hashCode() ?: 0)
        val te = o.textures
        if (te != null) {
            h = h * 31 + te.default.hashCode()
            for (f in te.explicitFaces.sorted()) h = h * 31 + f * 7 + te.face(f).hashCode()
        }
        return h
    }

    /** Geometry for an object, or null if it cannot be drawn (yet). */
    private fun facesFor(o: SimObject): List<GpuFace>? {
        if (o.isAvatar) return primCache.getOrPut(AVATAR_SHAPE) { PrimVolume.build(AVATAR_SHAPE).faces.map { Geometry.upload(engine, it) } }
        if (o.pcode != PCode.PRIM) return null
        val s = o.sculpt
        if (s != null) {
            if (s.kind != SculptKind.MESH) return null // sculpt maps are textures: needs the JPEG 2000 decoder
            meshCache[s.assetId]?.let { return it }
            meshes.request(s.assetId)
            val decoded = meshes.peek(s.assetId) ?: return null
            val up = decoded.faces.map { Geometry.upload(engine, it) }
            meshCache[s.assetId] = up
            return up
        }
        return primCache.getOrPut(o.params) { PrimVolume.build(o.params).faces.map { Geometry.upload(engine, it) } }
    }

    private fun buildDrawn(o: SimObject, sig: Int, faces: List<GpuFace>): Drawn? {
        if (faces.isEmpty()) return null
        val entity = EntityManager.get().create()
        val b = RenderableManager.Builder(faces.size)
        var minX = Float.MAX_VALUE; var minY = Float.MAX_VALUE; var minZ = Float.MAX_VALUE
        var maxX = -Float.MAX_VALUE; var maxY = -Float.MAX_VALUE; var maxZ = -Float.MAX_VALUE
        for ((i, f) in faces.withIndex()) {
            val app = if (o.isAvatar) null else o.textures?.face(f.faceIndex)
            val c = app?.color ?: if (o.isAvatar) AVATAR_COLOR else WHITE
            b.geometry(i, RenderableManager.PrimitiveType.TRIANGLES, f.vb, f.ib, 0, f.indexCount)
            b.material(i, materials.face(c[0], c[1], c[2], c[3], app?.glow ?: 0f, null, lighting))
            val bx = f.bounds
            val ctr = bx.center; val h = bx.halfExtent
            minX = minOf(minX, ctr[0] - h[0]); minY = minOf(minY, ctr[1] - h[1]); minZ = minOf(minZ, ctr[2] - h[2])
            maxX = maxOf(maxX, ctr[0] + h[0]); maxY = maxOf(maxY, ctr[1] + h[1]); maxZ = maxOf(maxZ, ctr[2] + h[2])
        }
        b.boundingBox(Box((minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2, (maxX - minX) / 2, (maxY - minY) / 2, (maxZ - minZ) / 2))
        b.culling(true).castShadows(false).receiveShadows(false)
        b.build(engine, entity)
        scene.addEntity(entity)
        return Drawn(entity, sig, faces)
    }

    private fun destroyDrawn(d: Drawn) {
        scene.removeEntity(d.entity)
        engine.destroyEntity(d.entity)
        EntityManager.get().destroy(d.entity)
    }

    // ---- water ---------------------------------------------------------------------------------

    private fun syncWater() {
        val h = session.region.value?.waterHeight ?: return
        if (h == waterHeightShown) return
        waterHeightShown = h
        if (waterEntity == 0) {
            val vb = VertexBuffer.Builder().bufferCount(1).vertexCount(4)
                .attribute(VertexBuffer.VertexAttribute.POSITION, 0, VertexBuffer.AttributeType.FLOAT3, 0, 12).build(engine)
            val ib = IndexBuffer.Builder().indexCount(6).bufferType(IndexBuffer.Builder.IndexType.USHORT).build(engine)
            val ibData = java.nio.ByteBuffer.allocateDirect(12).order(java.nio.ByteOrder.nativeOrder())
            for (i in shortArrayOf(0, 1, 2, 0, 2, 3)) ibData.putShort(i)
            ibData.flip(); ib.setBuffer(engine, ibData)
            val mi = materials.flat.createInstance().also { it.setParameter("uColor", 0.09f, 0.22f, 0.36f, 0.72f) }
            val e = EntityManager.get().create()
            RenderableManager.Builder(1).boundingBox(Box(128f, 128f, 0f, 128f, 128f, 1f))
                .geometry(0, RenderableManager.PrimitiveType.TRIANGLES, vb, ib, 0, 6).material(0, mi).culling(false).build(engine, e)
            scene.addEntity(e)
            waterEntity = e; waterVb = vb; waterIb = ib; waterMi = mi
        }
        val data = java.nio.ByteBuffer.allocateDirect(48).order(java.nio.ByteOrder.nativeOrder())
        // The region is 256 m square with its origin at one corner; extend a little past it so the edge is not visible.
        for ((x, y) in listOf(-512f to -512f, 768f to -512f, 768f to 768f, -512f to 768f)) data.putFloat(x).putFloat(y).putFloat(h)
        data.flip()
        waterVb!!.setBufferAt(engine, 0, data)
    }

    // ---- particles -----------------------------------------------------------------------------

    private fun stepParticles(dt: Float) {
        val seen = HashSet<Long>()
        val alpha = ArrayList<ParticleSprite>(); val add = ArrayList<ParticleSprite>()
        for (o in session.scene.snapshot()) {
            val p = o.particles ?: continue
            val wt = session.scene.worldTransform(o) ?: continue
            val dx = wt.first.x - camPos[0]; val dy = wt.first.y - camPos[1]
            if (dx * dx + dy * dy > PARTICLE_DISTANCE * PARTICLE_DISTANCE) continue
            seen += o.localId
            val key = p.hashCode() * 31 + p.startColor.contentHashCode() + p.endColor.contentHashCode()
            var e = emitters[o.localId]
            if (e == null || e.first != key) { e = key to ParticleEmitter(p); emitters[o.localId] = e }
            e.second.step(dt, wt.first, wt.second)
            (if (p.emissive) add else alpha) += e.second.sprites()
        }
        emitters.keys.retainAll(seen)
        val l = FloatArray(3); val u = FloatArray(3)
        camera.getLeftVector(l); camera.getUpVector(u)
        // Camera's right = -left.
        particlesAlpha.update(alpha, -l[0], -l[1], -l[2], u[0], u[1], u[2])
        particlesAdd.update(add, -l[0], -l[1], -l[2], u[0], u[1], u[2])
        stats = stats.copy(particles = alpha.size + add.size)
    }

    // ---- input ---------------------------------------------------------------------------------

    private inner class Touch : android.view.View.OnTouchListener {
        private var lastX = 0f; private var lastY = 0f; private var lastDist = 0f
        override fun onTouch(v: android.view.View, e: MotionEvent): Boolean {
            when (e.actionMasked) {
                MotionEvent.ACTION_DOWN -> { lastX = e.x; lastY = e.y }
                MotionEvent.ACTION_POINTER_DOWN -> lastDist = spread(e)
                MotionEvent.ACTION_MOVE -> if (e.pointerCount >= 2) {
                    val d = spread(e)
                    if (lastDist > 0f) distance = (distance * lastDist / d).coerceIn(1.5f, 80f)
                    lastDist = d
                } else {
                    yaw -= (e.x - lastX) * 0.006f
                    pitch = (pitch + (e.y - lastY) * 0.004f).coerceIn(-0.2f, 1.45f)
                    lastX = e.x; lastY = e.y
                }
                MotionEvent.ACTION_POINTER_UP -> { lastX = e.x; lastY = e.y }
            }
            return true
        }
        private fun spread(e: MotionEvent): Float { val dx = e.getX(0) - e.getX(1); val dy = e.getY(0) - e.getY(1); return sqrt(dx * dx + dy * dy).coerceAtLeast(1f) }
    }

    // ---- teardown ------------------------------------------------------------------------------

    fun destroy() {
        stop()
        for (d in drawn.values) destroyDrawn(d)
        drawn.clear()
        for (f in primCache.values.flatten() + meshCache.values.flatten()) f.destroy(engine)
        primCache.clear(); meshCache.clear()
        particlesAlpha.destroy(); particlesAdd.destroy()
        if (waterEntity != 0) { scene.removeEntity(waterEntity); engine.destroyEntity(waterEntity); EntityManager.get().destroy(waterEntity) }
        waterVb?.let { engine.destroyVertexBuffer(it) }; waterIb?.let { engine.destroyIndexBuffer(it) }; waterMi?.let { engine.destroyMaterialInstance(it) }
        materials.destroy()
        engine.destroySkybox(skybox)
        swapChain?.let { engine.destroySwapChain(it) }
        engine.destroyView(view); engine.destroyScene(scene); engine.destroyRenderer(renderer)
        engine.destroyCameraComponent(cameraEntity); EntityManager.get().destroy(cameraEntity)
        engine.destroy()
    }

    private companion object {
        const val MAX_DISTANCE = 192f
        const val PARTICLE_DISTANCE = 96f
        const val MAX_OBJECTS = 1500
        const val MAX_CREATE_PER_SYNC = 40
        const val AVATAR_WIDTH = 0.55f
        const val AVATAR_HEIGHT = 1.8f
        val AVATAR_SHAPE = PrimParams(profileCurve = 0)
        val AVATAR_COLOR = floatArrayOf(0.85f, 0.65f, 0.45f, 1f)
        val WHITE = floatArrayOf(1f, 1f, 1f, 1f)
    }
}
