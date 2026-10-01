package app.linkpoint.viewer.world

import app.linkpoint.core.scene.ParticleSprite
import com.google.android.filament.Engine
import com.google.android.filament.IndexBuffer
import com.google.android.filament.MaterialInstance
import com.google.android.filament.RenderableManager
import com.google.android.filament.Scene
import com.google.android.filament.VertexBuffer
import com.google.android.filament.Box
import com.google.android.filament.EntityManager
import java.nio.ByteBuffer
import java.nio.ByteOrder

/**
 * Draws up to [capacity] camera-facing particle quads in one renderable. Vertices are rebuilt on
 * the CPU each frame in world space, so the entity keeps an identity transform.
 */
class ParticleBatch(private val engine: Engine, private val scene: Scene, material: MaterialInstance, private val capacity: Int = 2048) {
    private val stride = 12 + 4 + 8 // position, RGBA8, uv
    private val vb: VertexBuffer = VertexBuffer.Builder().bufferCount(1).vertexCount(capacity * 4)
        .attribute(VertexBuffer.VertexAttribute.POSITION, 0, VertexBuffer.AttributeType.FLOAT3, 0, stride)
        .attribute(VertexBuffer.VertexAttribute.COLOR, 0, VertexBuffer.AttributeType.UBYTE4, 12, stride)
        .normalized(VertexBuffer.VertexAttribute.COLOR)
        .attribute(VertexBuffer.VertexAttribute.UV0, 0, VertexBuffer.AttributeType.FLOAT2, 16, stride)
        .build(engine)
    private val ib: IndexBuffer = IndexBuffer.Builder().indexCount(capacity * 6).bufferType(IndexBuffer.Builder.IndexType.USHORT).build(engine)
    private val entity = EntityManager.get().create()
    private val data = ByteBuffer.allocateDirect(capacity * 4 * stride).order(ByteOrder.nativeOrder())
    private val rm get() = engine.renderableManager

    init {
        val idx = ByteBuffer.allocateDirect(capacity * 6 * 2).order(ByteOrder.nativeOrder())
        for (q in 0 until capacity) {
            val b = q * 4
            for (i in intArrayOf(b, b + 1, b + 2, b, b + 2, b + 3)) idx.putShort(i.toShort())
        }
        idx.flip()
        ib.setBuffer(engine, idx)
        RenderableManager.Builder(1)
            .boundingBox(Box(0f, 0f, 0f, 1.0e5f, 1.0e5f, 1.0e5f))
            .geometry(0, RenderableManager.PrimitiveType.TRIANGLES, vb, ib, 0, 0)
            .material(0, material)
            .culling(false)
            .build(engine, entity)
        scene.addEntity(entity)
    }

    /** Fill the batch. [rx]/[ry]/[rz] and [ux]/[uy]/[uz] are the camera's right and up vectors. */
    fun update(sprites: List<ParticleSprite>, rx: Float, ry: Float, rz: Float, ux: Float, uy: Float, uz: Float) {
        val n = minOf(sprites.size, capacity)
        data.clear()
        for (i in 0 until n) {
            val s = sprites[i]
            val hx = s.sizeX / 2; val hy = s.sizeY / 2
            val c = ((s.r.coerceIn(0f, 1f) * 255).toInt()) or (((s.g.coerceIn(0f, 1f) * 255).toInt()) shl 8) or
                (((s.b.coerceIn(0f, 1f) * 255).toInt()) shl 16) or (((s.a.coerceIn(0f, 1f) * 255).toInt()) shl 24)
            val corners = arrayOf(floatArrayOf(-1f, -1f, 0f, 0f), floatArrayOf(1f, -1f, 1f, 0f), floatArrayOf(1f, 1f, 1f, 1f), floatArrayOf(-1f, 1f, 0f, 1f))
            for (k in corners) {
                data.putFloat(s.x + rx * hx * k[0] + ux * hy * k[1])
                data.putFloat(s.y + ry * hx * k[0] + uy * hy * k[1])
                data.putFloat(s.z + rz * hx * k[0] + uz * hy * k[1])
                data.putInt(c)
                data.putFloat(k[2]).putFloat(k[3])
            }
        }
        data.flip()
        if (n > 0) vb.setBufferAt(engine, 0, data)
        rm.setGeometryAt(rm.getInstance(entity), 0, RenderableManager.PrimitiveType.TRIANGLES, vb, ib, 0, n * 6)
    }

    fun destroy() {
        scene.removeEntity(entity)
        engine.destroyEntity(entity)
        EntityManager.get().destroy(entity)
        engine.destroyVertexBuffer(vb)
        engine.destroyIndexBuffer(ib)
    }
}
