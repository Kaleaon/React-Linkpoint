package app.linkpoint.viewer.world

import app.linkpoint.core.scene.MeshFace
import com.google.android.filament.Box
import com.google.android.filament.Engine
import com.google.android.filament.IndexBuffer
import com.google.android.filament.SurfaceOrientation
import com.google.android.filament.VertexBuffer
import java.nio.ByteBuffer
import java.nio.ByteOrder

/** GPU buffers for one face. Positions are in unit space; the entity transform scales and places them. */
class GpuFace(val vb: VertexBuffer, val ib: IndexBuffer, val indexCount: Int, val bounds: Box, val faceIndex: Int) {
    fun destroy(engine: Engine) { engine.destroyVertexBuffer(vb); engine.destroyIndexBuffer(ib) }
}

object Geometry {
    private const val STRIDE = 12 + 8 + 8 // position, tangent frame quaternion (4 x int16), uv

    /** Upload a face with an interleaved vertex layout of position, tangent-frame quaternion and UV. */
    fun upload(engine: Engine, f: MeshFace): GpuFace {
        val n = f.vertexCount
        val quats = ByteBuffer.allocateDirect(n * 4 * 2).order(ByteOrder.nativeOrder())
        val normals = ByteBuffer.allocateDirect(n * 12).order(ByteOrder.nativeOrder()).also { b -> b.asFloatBuffer().put(f.normals); }
        val so = SurfaceOrientation.Builder().vertexCount(n).normals(normals.asFloatBuffer()).build()
        so.getQuatsAsShort(quats.asShortBuffer())
        so.destroy()

        val data = ByteBuffer.allocateDirect(n * STRIDE).order(ByteOrder.nativeOrder())
        var minX = Float.MAX_VALUE; var minY = Float.MAX_VALUE; var minZ = Float.MAX_VALUE
        var maxX = -Float.MAX_VALUE; var maxY = -Float.MAX_VALUE; var maxZ = -Float.MAX_VALUE
        for (i in 0 until n) {
            val x = f.positions[i * 3]; val y = f.positions[i * 3 + 1]; val z = f.positions[i * 3 + 2]
            data.putFloat(x).putFloat(y).putFloat(z)
            data.putShort(quats.getShort(i * 8)).putShort(quats.getShort(i * 8 + 2)).putShort(quats.getShort(i * 8 + 4)).putShort(quats.getShort(i * 8 + 6))
            data.putFloat(f.uvs[i * 2]).putFloat(f.uvs[i * 2 + 1])
            if (x < minX) minX = x; if (y < minY) minY = y; if (z < minZ) minZ = z
            if (x > maxX) maxX = x; if (y > maxY) maxY = y; if (z > maxZ) maxZ = z
        }
        data.flip()

        val vb = VertexBuffer.Builder()
            .bufferCount(1).vertexCount(n)
            .attribute(VertexBuffer.VertexAttribute.POSITION, 0, VertexBuffer.AttributeType.FLOAT3, 0, STRIDE)
            .attribute(VertexBuffer.VertexAttribute.TANGENTS, 0, VertexBuffer.AttributeType.SHORT4, 12, STRIDE)
            .normalized(VertexBuffer.VertexAttribute.TANGENTS)
            .attribute(VertexBuffer.VertexAttribute.UV0, 0, VertexBuffer.AttributeType.FLOAT2, 20, STRIDE)
            .build(engine)
        vb.setBufferAt(engine, 0, data)

        val big = n > 65535
        val ibData = ByteBuffer.allocateDirect(f.indices.size * if (big) 4 else 2).order(ByteOrder.nativeOrder())
        if (big) for (i in f.indices) ibData.putInt(i) else for (i in f.indices) ibData.putShort(i.toShort())
        ibData.flip()
        val ib = IndexBuffer.Builder().indexCount(f.indices.size)
            .bufferType(if (big) IndexBuffer.Builder.IndexType.UINT else IndexBuffer.Builder.IndexType.USHORT).build(engine)
        ib.setBuffer(engine, ibData)

        val c = floatArrayOf((minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2)
        val h = floatArrayOf(((maxX - minX) / 2).coerceAtLeast(1e-4f), ((maxY - minY) / 2).coerceAtLeast(1e-4f), ((maxZ - minZ) / 2).coerceAtLeast(1e-4f))
        return GpuFace(vb, ib, f.indices.size, Box(c[0], c[1], c[2], h[0], h[1], h[2]), f.faceIndex)
    }

    /** Column-major 4x4 for translate * rotate(quaternion) * scale. */
    fun transform(px: Float, py: Float, pz: Float, qx: Float, qy: Float, qz: Float, qw: Float, sx: Float, sy: Float, sz: Float, out: FloatArray = FloatArray(16)): FloatArray {
        val xx = qx * qx; val yy = qy * qy; val zz = qz * qz
        val xy = qx * qy; val xz = qx * qz; val yz = qy * qz
        val wx = qw * qx; val wy = qw * qy; val wz = qw * qz
        out[0] = (1 - 2 * (yy + zz)) * sx; out[1] = 2 * (xy + wz) * sx; out[2] = 2 * (xz - wy) * sx; out[3] = 0f
        out[4] = 2 * (xy - wz) * sy; out[5] = (1 - 2 * (xx + zz)) * sy; out[6] = 2 * (yz + wx) * sy; out[7] = 0f
        out[8] = 2 * (xz + wy) * sz; out[9] = 2 * (yz - wx) * sz; out[10] = (1 - 2 * (xx + yy)) * sz; out[11] = 0f
        out[12] = px; out[13] = py; out[14] = pz; out[15] = 1f
        return out
    }
}
