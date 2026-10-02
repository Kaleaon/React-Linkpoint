package app.linkpoint.viewer.world

import app.linkpoint.core.image.TextureData
import app.linkpoint.core.image.TextureFetcher
import com.google.android.filament.Engine
import com.google.android.filament.Texture
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.util.UUID

class GpuTexture(val texture: Texture, val hasAlpha: Boolean)

/** Turns fetched, decoded textures into Filament textures (with their mip chains) on first use. */
class GpuTextures(private val engine: Engine, private val fetcher: TextureFetcher) {
    private val textures = HashMap<UUID, GpuTexture>()
    private var uploadsThisFrame = 0

    /** Called once per frame so a burst of arrivals does not stall one frame. */
    fun beginFrame() { uploadsThisFrame = 0 }

    /** The uploaded texture, or null while it is still downloading or decoding, or if it failed. */
    fun get(id: UUID): GpuTexture? {
        textures[id]?.let { return it }
        if (!fetcher.request(id)) return null
        val data = fetcher.peek(id) ?: return null
        if (uploadsThisFrame >= MAX_UPLOADS_PER_FRAME) return null
        uploadsThisFrame++
        return upload(data).also { textures[id] = it; fetcher.release(id) }
    }

    fun failed(id: UUID): Boolean = fetcher.failure(id) != null

    private fun upload(d: TextureData): GpuTexture {
        val t = Texture.Builder().width(d.width).height(d.height).levels(d.levels.size)
            .sampler(Texture.Sampler.SAMPLER_2D).format(Texture.InternalFormat.RGBA8).build(engine)
        for ((level, bytes) in d.levels.withIndex()) {
            val buf = ByteBuffer.allocateDirect(bytes.size).order(ByteOrder.nativeOrder()).put(bytes).also { it.flip() }
            t.setImage(engine, level, Texture.PixelBufferDescriptor(buf, Texture.Format.RGBA, Texture.Type.UBYTE))
        }
        return GpuTexture(t, d.hasAlpha)
    }

    fun destroy() {
        for (t in textures.values) engine.destroyTexture(t.texture)
        textures.clear()
    }

    private companion object { const val MAX_UPLOADS_PER_FRAME = 2 }
}
