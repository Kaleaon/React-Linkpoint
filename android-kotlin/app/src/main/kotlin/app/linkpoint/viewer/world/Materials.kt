package app.linkpoint.viewer.world

import android.content.Context
import com.google.android.filament.Engine
import com.google.android.filament.Material
import com.google.android.filament.MaterialInstance
import com.google.android.filament.Texture
import com.google.android.filament.TextureSampler
import java.nio.ByteBuffer
import java.nio.ByteOrder

/** How the world is lit. Replaced by the region's environment when one is known. */
class Lighting(
    /** Direction towards the light, world space (Z up). */
    var lightDir: FloatArray = floatArrayOf(0.4f, 0.3f, 0.85f),
    var lightColor: FloatArray = floatArrayOf(0.8f, 0.78f, 0.72f),
    var ambient: FloatArray = floatArrayOf(0.35f, 0.38f, 0.45f),
    var sky: FloatArray = floatArrayOf(0.36f, 0.56f, 0.86f),
)

/** Loads the precompiled materials from assets (built from the .mat files in android-kotlin/materials with matc). */
class Materials(private val engine: Engine, private val context: Context) {
    private fun load(name: String): Material {
        val bytes = context.assets.open("materials/$name.filamat").use { it.readBytes() }
        val buf = ByteBuffer.allocateDirect(bytes.size).order(ByteOrder.nativeOrder()).put(bytes).also { it.flip() }
        return Material.Builder().payload(buf, buf.remaining()).build(engine)
    }

    val prim = load("prim")
    val primBlend = load("prim_blend")
    val particle = load("particle")
    val particleAdd = load("particle_add")
    val flat = load("flat")
    /** Compiled from materials/terrain.mat (shared with the web renderer, same matc version and flags). */
    val terrain = load("terrain")

    /** A 1x1 white texture bound to every sampler that has no real texture, so shaders can always sample. */
    val white: Texture = Texture.Builder().width(1).height(1).levels(1).sampler(Texture.Sampler.SAMPLER_2D)
        .format(Texture.InternalFormat.RGBA8).build(engine).also {
            val px = ByteBuffer.allocateDirect(4).order(ByteOrder.nativeOrder()).put(byteArrayOf(-1, -1, -1, -1)).also { b -> b.flip() }
            it.setImage(engine, 0, Texture.PixelBufferDescriptor(px, Texture.Format.RGBA, Texture.Type.UBYTE))
        }
    val sampler = TextureSampler(TextureSampler.MinFilter.LINEAR_MIPMAP_LINEAR, TextureSampler.MagFilter.LINEAR, TextureSampler.WrapMode.REPEAT)

    private val instances = HashMap<String, MaterialInstance>()

    /** A shared material instance for a face colour (and optional texture). */
    fun face(r: Float, g: Float, b: Float, a: Float, glow: Float, texture: Texture?, light: Lighting): MaterialInstance {
        val blend = a < 0.99f
        val key = "$blend|$r|$g|$b|$a|$glow|${texture?.nativeObject}"
        return instances.getOrPut(key) {
            (if (blend) primBlend else prim).createInstance().also { mi ->
                mi.setParameter("uColor", r, g, b, a)
                mi.setParameter("uGlow", glow)
                mi.setParameter("uFullbright", 0f)
                mi.setParameter("uUseTexture", if (texture != null) 1f else 0f)
                mi.setParameter("uTexture", texture ?: white, sampler)
                applyLight(mi, light)
            }
        }
    }

    fun applyLight(mi: MaterialInstance, l: Lighting) {
        mi.setParameter("uLightDir", l.lightDir[0], l.lightDir[1], l.lightDir[2])
        mi.setParameter("uLightColor", l.lightColor[0], l.lightColor[1], l.lightColor[2])
        mi.setParameter("uAmbientColor", l.ambient[0], l.ambient[1], l.ambient[2])
    }

    /** Re-apply the lighting to every cached face instance (when the environment changes). */
    fun relight(l: Lighting) { for (mi in instances.values) applyLight(mi, l) }

    fun destroy() {
        for (mi in instances.values) engine.destroyMaterialInstance(mi)
        instances.clear()
        engine.destroyTexture(white)
        for (m in listOf(prim, primBlend, particle, particleAdd, flat, terrain)) engine.destroyMaterial(m)
    }
}
