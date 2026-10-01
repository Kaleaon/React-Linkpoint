package app.linkpoint.viewer.world

import app.linkpoint.core.model.TerrainInfo
import app.linkpoint.core.scene.MeshFace
import app.linkpoint.core.terrain.Heightmap
import app.linkpoint.core.terrain.TerrainComposition
import com.google.android.filament.Engine
import com.google.android.filament.EntityManager
import com.google.android.filament.MaterialInstance
import com.google.android.filament.RenderableManager
import com.google.android.filament.Scene
import com.google.android.filament.Texture
import com.google.android.filament.TextureSampler
import java.nio.ByteBuffer
import java.nio.ByteOrder
import kotlin.math.sqrt

/**
 * The region's ground: a 256 x 256 height grid coloured by the viewer's height-and-noise
 * composition. Detail textures are not decoded yet, so each layer shows its fallback colour.
 */
class TerrainRenderer(private val engine: Engine, private val scene: Scene, private val materials: Materials) {
    private var entity = 0
    private var face: GpuFace? = null
    private var composition: Texture? = null
    private val instance: MaterialInstance = materials.terrain.createInstance()
    private val clampSampler = TextureSampler(TextureSampler.MinFilter.LINEAR, TextureSampler.MagFilter.LINEAR, TextureSampler.WrapMode.CLAMP_TO_EDGE)
    private var shownVersion = -1
    private var lastBuild = 0L

    init {
        instance.setParameter("uComposition", materials.white, clampSampler)
        for (i in 0..3) {
            instance.setParameter("uDetail$i", materials.white, materials.sampler)
            val c = TerrainComposition.FALLBACK_COLORS[i]
            instance.setParameter("uFallback$i", c[0], c[1], c[2])
        }
        instance.setParameter("uDetailUse", 0f, 0f, 0f, 0f)
        instance.setParameter("uTileScale", 256f / TerrainComposition.DETAIL_TILE_METRES)
    }

    fun setLight(l: Lighting, centerX: Float, centerY: Float, centerZ: Float) {
        // The material lights from a point; put it far away along the sun direction.
        instance.setParameter("uLightPos", centerX + l.lightDir[0] * 5000f, centerY + l.lightDir[1] * 5000f, centerZ + l.lightDir[2] * 5000f)
        instance.setParameter("uLightColor", l.lightColor[0], l.lightColor[1], l.lightColor[2])
        instance.setParameter("uAmbientColor", l.ambient[0], l.ambient[1], l.ambient[2])
    }

    /** Rebuild the mesh and colour texture when new patches have arrived (at most about once a second). */
    fun update(h: Heightmap, info: TerrainInfo?, gridX: Int, gridY: Int, nowNanos: Long) {
        if (h.version == shownVersion || h.patchCount == 0) return
        if (nowNanos - lastBuild < 1_000_000_000L && !h.isComplete) return
        shownVersion = h.version; lastBuild = nowNanos

        val n = Heightmap.SIZE
        val heights = h.heights.copyOf()
        // Composition colours.
        val values = if (info != null) {
            TerrainComposition.compose(heights, n, TerrainComposition.Params(info.startHeights, info.heightRanges, gridX * 256.0, gridY * 256.0))
        } else FloatArray(n * n) { 1.5f }
        val bytes = TerrainComposition.toBytes(values)
        composition?.let { engine.destroyTexture(it) }
        val tex = Texture.Builder().width(n).height(n).levels(1).sampler(Texture.Sampler.SAMPLER_2D).format(Texture.InternalFormat.R8).build(engine)
        val buf = ByteBuffer.allocateDirect(bytes.size).order(ByteOrder.nativeOrder()).put(bytes).also { it.flip() }
        tex.setImage(engine, 0, Texture.PixelBufferDescriptor(buf, Texture.Format.R, Texture.Type.UBYTE))
        composition = tex
        instance.setParameter("uComposition", tex, clampSampler)

        // Mesh: one vertex per sample, normals from central differences, v = row / 255 matching the texture rows.
        val pos = FloatArray(n * n * 3); val nrm = FloatArray(n * n * 3); val uv = FloatArray(n * n * 2)
        for (j in 0 until n) for (i in 0 until n) {
            val k = j * n + i
            pos[k * 3] = i.toFloat(); pos[k * 3 + 1] = j.toFloat(); pos[k * 3 + 2] = heights[k]
            val hl = heights[j * n + maxOf(i - 1, 0)]; val hr = heights[j * n + minOf(i + 1, n - 1)]
            val hd = heights[maxOf(j - 1, 0) * n + i]; val hu = heights[minOf(j + 1, n - 1) * n + i]
            val dx = (hr - hl) / (minOf(i + 1, n - 1) - maxOf(i - 1, 0)); val dy = (hu - hd) / (minOf(j + 1, n - 1) - maxOf(j - 1, 0))
            val len = sqrt(dx * dx + dy * dy + 1f)
            nrm[k * 3] = -dx / len; nrm[k * 3 + 1] = -dy / len; nrm[k * 3 + 2] = 1f / len
            uv[k * 2] = i / (n - 1f); uv[k * 2 + 1] = j / (n - 1f)
        }
        val idx = IntArray((n - 1) * (n - 1) * 6)
        var t = 0
        for (j in 0 until n - 1) for (i in 0 until n - 1) {
            val a = j * n + i; val b = a + 1; val c = a + n; val d = c + 1
            idx[t++] = a; idx[t++] = b; idx[t++] = d; idx[t++] = a; idx[t++] = d; idx[t++] = c // counter-clockwise seen from above
        }
        val newFace = Geometry.upload(engine, MeshFace(0, pos, nrm, uv, idx))
        val old = face; val oldEntity = entity
        val e = EntityManager.get().create()
        RenderableManager.Builder(1)
            .boundingBox(newFace.bounds)
            .geometry(0, RenderableManager.PrimitiveType.TRIANGLES, newFace.vb, newFace.ib, 0, newFace.indexCount)
            .material(0, instance).culling(false).build(engine, e)
        scene.addEntity(e)
        entity = e; face = newFace
        if (oldEntity != 0) { scene.removeEntity(oldEntity); engine.destroyEntity(oldEntity); EntityManager.get().destroy(oldEntity) }
        old?.destroy(engine)
    }

    fun destroy() {
        if (entity != 0) { scene.removeEntity(entity); engine.destroyEntity(entity); EntityManager.get().destroy(entity) }
        face?.destroy(engine)
        composition?.let { engine.destroyTexture(it) }
        engine.destroyMaterialInstance(instance)
    }
}
