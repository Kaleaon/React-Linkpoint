package app.linkpoint.viewer.world

import app.linkpoint.core.env.EnvSample
import app.linkpoint.core.env.Env
import com.google.android.filament.Box
import com.google.android.filament.Engine
import com.google.android.filament.EntityManager
import com.google.android.filament.IndexBuffer
import com.google.android.filament.MaterialInstance
import com.google.android.filament.RenderableManager
import com.google.android.filament.Scene
import com.google.android.filament.VertexBuffer
import java.nio.ByteBuffer
import java.nio.ByteOrder
import kotlin.math.sqrt

/**
 * The sky dome (atmospheric scattering with sun and moon discs) and the animated water surface,
 * driven by the region's environment. Parameters are named as in materials/sky.mat and water.mat.
 */
class EnvironmentRenderer(private val engine: Engine, private val scene: Scene, materials: Materials) {
    private val skyMi: MaterialInstance = materials.sky.createInstance()
    private val waterMi: MaterialInstance = materials.water.createInstance()
    private var skyEntity = 0
    private var skyVb: VertexBuffer? = null
    private var skyIb: IndexBuffer? = null
    private var waterEntity = 0
    private var waterVb: VertexBuffer? = null
    private var waterIb: IndexBuffer? = null

    init {
        buildSky()
        buildWater()
        // Wave tables from the web renderer (WATER_WAVES in sky.ts).
        waterMi.setParameter("uFrequency", 17.951958f, 12.566371f, 8.975979f, 15.707963f)
        waterMi.setParameter("uPhase", 1.73f, 0.64f, 1.27f, 0.9f)
        waterMi.setParameter("uAmplitude", 0.5f, 0.5f, 0.3f, 0.4f)
        waterMi.setParameter("uDirection01", 1f, 0.3f, 0.4f, 0.75f)
        waterMi.setParameter("uDirection23", -0.5f, 0.7f, 0.63f, -0.3f)
        waterMi.setParameter("uNormalScale", 0.06f)
        waterMi.setParameter("uSunUp", 1f)
    }

    private fun buildSky() {
        val (verts, idx) = icosphere(2)
        val vb = VertexBuffer.Builder().bufferCount(1).vertexCount(verts.size / 3)
            .attribute(VertexBuffer.VertexAttribute.POSITION, 0, VertexBuffer.AttributeType.FLOAT3, 0, 12).build(engine)
        val vd = ByteBuffer.allocateDirect(verts.size * 4).order(ByteOrder.nativeOrder()).also { b -> verts.forEach { b.putFloat(it) }; b.flip() }
        vb.setBufferAt(engine, 0, vd)
        val ib = IndexBuffer.Builder().indexCount(idx.size).bufferType(IndexBuffer.Builder.IndexType.USHORT).build(engine)
        val id = ByteBuffer.allocateDirect(idx.size * 2).order(ByteOrder.nativeOrder()).also { b -> idx.forEach { b.putShort(it.toShort()) }; b.flip() }
        ib.setBuffer(engine, id)
        val e = EntityManager.get().create()
        RenderableManager.Builder(1).boundingBox(Box(0f, 0f, 0f, 1.0e6f, 1.0e6f, 1.0e6f))
            .geometry(0, RenderableManager.PrimitiveType.TRIANGLES, vb, ib, 0, idx.size).material(0, skyMi)
            .culling(false).priority(0).castShadows(false).receiveShadows(false).build(engine, e)
        scene.addEntity(e)
        skyEntity = e; skyVb = vb; skyIb = ib
    }

    private fun buildWater() {
        val lo = 128f - 1536f; val hi = 128f + 1536f
        val vb = VertexBuffer.Builder().bufferCount(1).vertexCount(4)
            .attribute(VertexBuffer.VertexAttribute.POSITION, 0, VertexBuffer.AttributeType.FLOAT3, 0, 12).build(engine)
        val vd = ByteBuffer.allocateDirect(48).order(ByteOrder.nativeOrder())
        for ((x, y) in listOf(lo to lo, hi to lo, hi to hi, lo to hi)) vd.putFloat(x).putFloat(y).putFloat(0f)
        vd.flip(); vb.setBufferAt(engine, 0, vd)
        val ib = IndexBuffer.Builder().indexCount(6).bufferType(IndexBuffer.Builder.IndexType.USHORT).build(engine)
        val id = ByteBuffer.allocateDirect(12).order(ByteOrder.nativeOrder())
        for (i in shortArrayOf(0, 1, 2, 0, 2, 3)) id.putShort(i)
        id.flip(); ib.setBuffer(engine, id)
        val e = EntityManager.get().create()
        RenderableManager.Builder(1).boundingBox(Box(128f, 128f, 0f, 1536f, 1536f, 1f))
            .geometry(0, RenderableManager.PrimitiveType.TRIANGLES, vb, ib, 0, 6).material(0, waterMi)
            .culling(false).castShadows(false).receiveShadows(false).build(engine, e)
        scene.addEntity(e)
        waterEntity = e; waterVb = vb; waterIb = ib
    }

    private fun f3(a: DoubleArray) = floatArrayOf(a[0].toFloat(), a[1].toFloat(), a[2].toFloat())

    private fun atmosphere(mi: MaterialInstance, s: EnvSample) {
        val sky = s.sky; val st = s.state
        fun v(name: String, a: DoubleArray) { val f = f3(a); mi.setParameter(name, f[0], f[1], f[2]) }
        v("uBlueHorizon", sky.blueHorizon); v("uBlueDensity", sky.blueDensity); v("uAmbient", sky.ambient)
        v("uSunlight", sky.sunlightColor); v("uGlow", sky.glow); v("uLightNorm", st.lightDirection)
        mi.setParameter("uHazeHorizon", sky.hazeHorizon.toFloat()); mi.setParameter("uHazeDensity", sky.hazeDensity.toFloat())
        mi.setParameter("uDensityMultiplier", sky.densityMultiplier.toFloat()); mi.setParameter("uMaxY", sky.maxY.toFloat())
        mi.setParameter("uCloudShadow", sky.cloudShadow.toFloat()); mi.setParameter("uSunUp", if (st.sunUp) 1f else 0f)
        mi.setParameter("uSunMoonGlow", st.sunMoonGlowFactor.toFloat())
    }

    /** Apply a new environment sample. [waterHeight] is the region's water level, [camera] the eye position. */
    fun update(s: EnvSample, waterHeight: Float, camera: FloatArray, timeSeconds: Float, pixelAngle: Float, lighting: Lighting) {
        atmosphere(skyMi, s)
        val sky = s.sky; val st = s.state
        fun v(name: String, a: DoubleArray) { val f = f3(a); skyMi.setParameter(name, f[0], f[1], f[2]) }
        v("uSunDir", st.sunDirection); v("uMoonDir", st.moonDirection)
        skyMi.setParameter("uSunRadius", (0.0095 * sky.sunScale).toFloat()); skyMi.setParameter("uMoonRadius", (0.0095 * sky.moonScale).toFloat())
        skyMi.setParameter("uMoonBrightness", sky.moonBrightness.toFloat()); skyMi.setParameter("uMoonUp", if (st.moonUp) 1f else 0f)

        atmosphere(waterMi, s)
        val w = s.water
        val fog = f3(w.fogColor)
        waterMi.setParameter("uFogColor", fog[0], fog[1], fog[2])
        waterMi.setParameter("uFogDensity", w.fogDensity.toFloat())
        waterMi.setParameter("uFresnelScale", w.fresnelScale.toFloat()); waterMi.setParameter("uFresnelOffset", w.fresnelOffset.toFloat())
        val ld = f3(st.lightDirection); waterMi.setParameter("uLightDir", ld[0], ld[1], ld[2])
        val lc = f3(if (st.sunUp) st.sunDiffuse else st.moonDiffuse); waterMi.setParameter("uLightColor", lc[0], lc[1], lc[2])
        val am = f3(if (st.sunUp) st.sunAmbient else st.moonAmbient); waterMi.setParameter("uSurfaceAmbient", am[0], am[1], am[2])
        waterMi.setParameter("uCameraPos", camera[0], camera[1], camera[2])
        waterMi.setParameter("uTime", timeSeconds); waterMi.setParameter("uPixelAngle", pixelAngle)
        waterMi.setParameter("uWaterHeight", waterHeight)

        // Surfaces are lit by whichever of the sun and moon is up.
        lighting.lightDir = f3(st.lightDirection)
        lighting.lightColor = lc
        lighting.ambient = am
        // The clear colour behind everything, for pixels the dome does not cover: the horizon colour.
        val horizon = Env.toneMapSky(Env.atmosphereColor(sky, st, doubleArrayOf(1.0, 0.0, 0.05)))
        lighting.sky = floatArrayOf(horizon[0].toFloat(), horizon[1].toFloat(), horizon[2].toFloat())
    }

    fun destroy() {
        for (e in listOf(skyEntity, waterEntity)) if (e != 0) { scene.removeEntity(e); engine.destroyEntity(e); EntityManager.get().destroy(e) }
        skyVb?.let { engine.destroyVertexBuffer(it) }; skyIb?.let { engine.destroyIndexBuffer(it) }
        waterVb?.let { engine.destroyVertexBuffer(it) }; waterIb?.let { engine.destroyIndexBuffer(it) }
        engine.destroyMaterialInstance(skyMi); engine.destroyMaterialInstance(waterMi)
    }

    /** Unit icosphere (20 * 4^n faces) with triangles wound inward, as seen from inside the dome. */
    private fun icosphere(subdivisions: Int): Pair<FloatArray, IntArray> {
        val t = (1 + sqrt(5.0)) / 2
        val seed = listOf(
            doubleArrayOf(-1.0, t, 0.0), doubleArrayOf(1.0, t, 0.0), doubleArrayOf(-1.0, -t, 0.0), doubleArrayOf(1.0, -t, 0.0),
            doubleArrayOf(0.0, -1.0, t), doubleArrayOf(0.0, 1.0, t), doubleArrayOf(0.0, -1.0, -t), doubleArrayOf(0.0, 1.0, -t),
            doubleArrayOf(t, 0.0, -1.0), doubleArrayOf(t, 0.0, 1.0), doubleArrayOf(-t, 0.0, -1.0), doubleArrayOf(-t, 0.0, 1.0),
        )
        fun norm(v: DoubleArray): DoubleArray { val l = sqrt(v.sumOf { it * it }); return DoubleArray(3) { v[it] / l } }
        val verts = ArrayList(seed.map(::norm))
        var faces = listOf(
            intArrayOf(0, 11, 5), intArrayOf(0, 5, 1), intArrayOf(0, 1, 7), intArrayOf(0, 7, 10), intArrayOf(0, 10, 11),
            intArrayOf(1, 5, 9), intArrayOf(5, 11, 4), intArrayOf(11, 10, 2), intArrayOf(10, 7, 6), intArrayOf(7, 1, 8),
            intArrayOf(3, 9, 4), intArrayOf(3, 4, 2), intArrayOf(3, 2, 6), intArrayOf(3, 6, 8), intArrayOf(3, 8, 9),
            intArrayOf(4, 9, 5), intArrayOf(2, 4, 11), intArrayOf(6, 2, 10), intArrayOf(8, 6, 7), intArrayOf(9, 8, 1),
        )
        repeat(subdivisions) {
            val cache = HashMap<Long, Int>()
            fun mid(a: Int, b: Int): Int {
                val key = if (a < b) a.toLong() * 100000 + b else b.toLong() * 100000 + a
                return cache.getOrPut(key) { verts.add(norm(DoubleArray(3) { (verts[a][it] + verts[b][it]) / 2 })); verts.size - 1 }
            }
            val next = ArrayList<IntArray>()
            for ((a, b, c) in faces.map { Triple(it[0], it[1], it[2]) }) {
                val ab = mid(a, b); val bc = mid(b, c); val ca = mid(c, a)
                next += intArrayOf(a, ab, ca); next += intArrayOf(b, bc, ab); next += intArrayOf(c, ca, bc); next += intArrayOf(ab, bc, ca)
            }
            faces = next
        }
        val out = FloatArray(verts.size * 3) { verts[it / 3][it % 3].toFloat() }
        val idx = IntArray(faces.size * 3)
        for ((i, f) in faces.withIndex()) { idx[i * 3] = f[0]; idx[i * 3 + 1] = f[2]; idx[i * 3 + 2] = f[1] }
        return out to idx
    }
}
