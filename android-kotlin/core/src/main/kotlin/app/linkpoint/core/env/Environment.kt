package app.linkpoint.core.env

import app.linkpoint.core.llsd.asLlsdList
import app.linkpoint.core.llsd.asLlsdMap
import kotlin.math.abs
import kotlin.math.acos
import kotlin.math.exp
import kotlin.math.max
import kotlin.math.min
import kotlin.math.pow
import kotlin.math.sin
import kotlin.math.sqrt

/** Sky and water settings and the derived light, following the official viewer. World space is Z up. Port of eep.ts / atmosphere.ts. */
class Sky(
    val sunlightColor: DoubleArray, val ambient: DoubleArray, val blueHorizon: DoubleArray, val blueDensity: DoubleArray,
    val hazeHorizon: Double, val hazeDensity: Double, val densityMultiplier: Double, val distanceMultiplier: Double, val maxY: Double,
    val glow: DoubleArray, val cloudShadow: Double, val gamma: Double,
    val sunRotation: DoubleArray, val moonRotation: DoubleArray,
    val moonBrightness: Double, val starBrightness: Double, val sunScale: Double, val moonScale: Double, val cloudColor: DoubleArray,
)

class Water(
    val fogColor: DoubleArray, val fogDensity: Double, val fogMod: Double, val fresnelOffset: Double, val fresnelScale: Double,
    val blurMultiplier: Double, val normalScale: DoubleArray, val scaleAbove: Double, val scaleBelow: Double,
    val wave1Direction: DoubleArray, val wave2Direction: DoubleArray,
)

class SkyState(
    val sunDirection: DoubleArray, val moonDirection: DoubleArray, val sunUp: Boolean, val moonUp: Boolean,
    /** Towards whichever of sun / moon is up (the sun when both are). */
    val lightDirection: DoubleArray,
    val sunMoonGlowFactor: Double,
    val sunDiffuse: DoubleArray, val sunAmbient: DoubleArray, val moonDiffuse: DoubleArray, val moonAmbient: DoubleArray,
)

object Env {
    val DEFAULT_SKY = Sky(
        doubleArrayOf(0.7342, 0.7815, 0.8999), doubleArrayOf(0.25, 0.25, 0.25), doubleArrayOf(0.4954, 0.4954, 0.6399), doubleArrayOf(0.2447, 0.4487, 0.7599),
        0.19, 0.7, 0.0001, 0.8, 1605.0, doubleArrayOf(5.0, 0.001, -0.4799), 0.2699, 1.0,
        doubleArrayOf(0.0, -0.7071, 0.0, 0.7071), doubleArrayOf(0.0, 0.7071, 0.0, 0.7071), 0.5, 250.0, 1.0, 1.0, doubleArrayOf(0.4099, 0.4099, 0.4099),
    )

    val DEFAULT_WATER = Water(
        doubleArrayOf(0.0156, 0.149, 0.2509), 2.0, 0.25, 0.5, 0.3999, 0.04, doubleArrayOf(2.0, 2.0, 2.0), 0.0299, 0.2,
        doubleArrayOf(1.04999, -0.42), doubleArrayOf(1.10999, -1.16),
    )

    // ---- reading settings (LLSD maps, snake_case or camelCase) ------------------------------------

    private fun pick(m: Map<String, Any?>?, vararg keys: String): Any? { for (k in keys) { val v = m?.get(k); if (v != null) return v }; return null }
    private fun d(v: Any?): Double? = (v as? Number)?.toDouble() ?: (v as? String)?.toDoubleOrNull()
    private fun vec3(v: Any?, fallback: DoubleArray): DoubleArray {
        val l = v.asLlsdList()
        if (l != null && l.size >= 3) { val a = l.take(3).map { d(it) }; if (a.all { it != null && it.isFinite() }) return DoubleArray(3) { a[it]!! } }
        return fallback.copyOf()
    }
    private fun num(v: Any?, fallback: Double): Double {
        val x = if (v is List<*>) d(v.firstOrNull()) else d(v)
        return if (x != null && x.isFinite()) x else fallback
    }
    private fun quat(v: Any?, fallback: DoubleArray): DoubleArray {
        val l = v.asLlsdList()
        if (l != null && l.size >= 4) {
            val a = l.take(4).map { d(it) }
            if (a.all { it != null && it.isFinite() }) {
                val n = sqrt(a.sumOf { it!! * it })
                if (n > 1e-9) return DoubleArray(4) { a[it]!! / n }
            }
        }
        return fallback.copyOf()
    }

    fun normalizeSky(frame: Map<String, Any?>?): Sky {
        val dflt = DEFAULT_SKY
        val haze = pick(frame, "legacyHaze", "legacy_haze").asLlsdMap() ?: emptyMap()
        fun hz(vararg k: String) = pick(haze, *k) ?: pick(frame, *k)
        return Sky(
            vec3(pick(frame, "sunlightColor", "sunlight_color"), dflt.sunlightColor), vec3(hz("ambient", "ambientColor", "ambient_color"), dflt.ambient),
            vec3(hz("blueHorizon", "blue_horizon"), dflt.blueHorizon), vec3(hz("blueDensity", "blue_density"), dflt.blueDensity),
            num(hz("hazeHorizon", "haze_horizon"), dflt.hazeHorizon), num(hz("hazeDensity", "haze_density"), dflt.hazeDensity),
            num(hz("densityMultiplier", "density_multiplier"), dflt.densityMultiplier), num(hz("distanceMultiplier", "distance_multiplier"), dflt.distanceMultiplier),
            num(pick(frame, "maxY", "max_y"), dflt.maxY), vec3(pick(frame, "glow"), dflt.glow), num(pick(frame, "cloudShadow", "cloud_shadow"), dflt.cloudShadow),
            num(pick(frame, "gamma"), dflt.gamma),
            quat(pick(frame, "sunRotation", "sun_rotation"), dflt.sunRotation), quat(pick(frame, "moonRotation", "moon_rotation"), dflt.moonRotation),
            num(pick(frame, "moonBrightness", "moon_brightness"), dflt.moonBrightness), num(pick(frame, "starBrightness", "star_brightness"), dflt.starBrightness),
            num(pick(frame, "sunScale", "sun_scale"), dflt.sunScale), num(pick(frame, "moonScale", "moon_scale"), dflt.moonScale),
            vec3(pick(frame, "cloudColor", "cloud_color"), dflt.cloudColor),
        )
    }

    fun normalizeWater(frame: Map<String, Any?>?): Water {
        val dflt = DEFAULT_WATER
        fun dir(v: Any?, f: DoubleArray): DoubleArray {
            val l = v.asLlsdList()
            if (l != null && l.size >= 2) { val a = l.take(2).map { d(it) }; if (a.all { it != null && it.isFinite() }) return doubleArrayOf(a[0]!!, a[1]!!) }
            return f.copyOf()
        }
        return Water(
            vec3(pick(frame, "waterFogColor", "water_fog_color"), dflt.fogColor), num(pick(frame, "waterFogDensity", "water_fog_density"), dflt.fogDensity),
            num(pick(frame, "underwaterFogMod", "underwater_fog_mod"), dflt.fogMod), num(pick(frame, "fresnelOffset", "fresnel_offset"), dflt.fresnelOffset),
            num(pick(frame, "fresnelScale", "fresnel_scale"), dflt.fresnelScale), num(pick(frame, "blurMultiplier", "blur_multiplier"), dflt.blurMultiplier),
            vec3(pick(frame, "normalScale", "normal_scale"), dflt.normalScale), num(pick(frame, "scaleAbove", "scale_above"), dflt.scaleAbove),
            num(pick(frame, "scaleBelow", "scale_below"), dflt.scaleBelow),
            dir(pick(frame, "wave1Direction", "wave1_direction"), dflt.wave1Direction), dir(pick(frame, "wave2Direction", "wave2_direction"), dflt.wave2Direction),
        )
    }

    // ---- blending ---------------------------------------------------------------------------------

    private fun lerp(a: Double, b: Double, t: Double) = a + (b - a) * t
    private fun lerp3(a: DoubleArray, b: DoubleArray, t: Double) = DoubleArray(3) { lerp(a[it], b[it], t) }

    fun slerp(a: DoubleArray, b: DoubleArray, t: Double): DoubleArray {
        var dot = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3]
        val bb = if (dot < 0) DoubleArray(4) { -b[it] } else b
        dot = abs(dot)
        if (dot > 0.9995) {
            val q = DoubleArray(4) { lerp(a[it], bb[it], t) }
            val n = sqrt(q.sumOf { it * it })
            return DoubleArray(4) { q[it] / n }
        }
        val theta = acos(min(1.0, dot)); val s = sin(theta)
        val wa = sin((1 - t) * theta) / s; val wb = sin(t * theta) / s
        return DoubleArray(4) { a[it] * wa + bb[it] * wb }
    }

    fun blendSky(a: Sky, b: Sky, t: Double) = Sky(
        lerp3(a.sunlightColor, b.sunlightColor, t), lerp3(a.ambient, b.ambient, t), lerp3(a.blueHorizon, b.blueHorizon, t), lerp3(a.blueDensity, b.blueDensity, t),
        lerp(a.hazeHorizon, b.hazeHorizon, t), lerp(a.hazeDensity, b.hazeDensity, t), lerp(a.densityMultiplier, b.densityMultiplier, t),
        lerp(a.distanceMultiplier, b.distanceMultiplier, t), lerp(a.maxY, b.maxY, t), lerp3(a.glow, b.glow, t), lerp(a.cloudShadow, b.cloudShadow, t), lerp(a.gamma, b.gamma, t),
        slerp(a.sunRotation, b.sunRotation, t), slerp(a.moonRotation, b.moonRotation, t), lerp(a.moonBrightness, b.moonBrightness, t),
        lerp(a.starBrightness, b.starBrightness, t), lerp(a.sunScale, b.sunScale, t), lerp(a.moonScale, b.moonScale, t), lerp3(a.cloudColor, b.cloudColor, t),
    )

    fun blendWater(a: Water, b: Water, t: Double): Water {
        fun l2(x: DoubleArray, y: DoubleArray) = doubleArrayOf(lerp(x[0], y[0], t), lerp(x[1], y[1], t))
        return Water(
            lerp3(a.fogColor, b.fogColor, t), lerp(a.fogDensity, b.fogDensity, t), lerp(a.fogMod, b.fogMod, t), lerp(a.fresnelOffset, b.fresnelOffset, t),
            lerp(a.fresnelScale, b.fresnelScale, t), lerp(a.blurMultiplier, b.blurMultiplier, t), lerp3(a.normalScale, b.normalScale, t),
            lerp(a.scaleAbove, b.scaleAbove, t), lerp(a.scaleBelow, b.scaleBelow, t), l2(a.wave1Direction, b.wave1Direction), l2(a.wave2Direction, b.wave2Direction),
        )
    }

    // ---- day cycle ----------------------------------------------------------------------------------

    /** Where in the cycle we are (0..1) at [nowSeconds] (Unix time) for the region's day length and offset in seconds. */
    fun dayFraction(nowSeconds: Double, dayLength: Double, dayOffset: Double = 0.0): Double {
        val length = if (dayLength.isFinite() && dayLength > 0) dayLength else 14400.0
        val t = (((nowSeconds + (if (dayOffset.isFinite()) dayOffset else 0.0)) % length) + length) % length
        return t / length
    }

    private class Key(val time: Double, val frame: Map<String, Any?>)

    private fun trackKeys(cycle: Map<String, Any?>, track: Int): List<Key> {
        val entries = cycle["tracks"].asLlsdList()?.getOrNull(track).asLlsdList() ?: return emptyList()
        val frames = cycle["frames"].asLlsdMap() ?: return emptyList()
        return entries.mapNotNull { e ->
            val m = e.asLlsdMap() ?: return@mapNotNull null
            val time = d(pick(m, "keyKeyframe", "key_keyframe")) ?: return@mapNotNull null
            val frame = frames[pick(m, "keyName", "key_name")?.toString()].asLlsdMap() ?: return@mapNotNull null
            Key(time, frame)
        }.sortedBy { it.time }
    }

    class Bracket(val a: Map<String, Any?>, val b: Map<String, Any?>, val t: Double)

    /** Frames either side of [fraction] on a track and how far between them, wrapping around the day. Null if the track is empty. */
    fun bracket(cycle: Map<String, Any?>, track: Int, fraction: Double): Bracket? {
        val keys = trackKeys(cycle, track)
        if (keys.isEmpty()) return null
        if (keys.size == 1) return Bracket(keys[0].frame, keys[0].frame, 0.0)
        val next = keys.indexOfFirst { it.time > fraction }
        val prev: Key; val after: Key; val span: Double; val into: Double
        when {
            next == -1 -> { prev = keys.last(); after = keys[0]; span = 1 - prev.time + after.time; into = fraction - prev.time }
            next == 0 -> { prev = keys.last(); after = keys[0]; span = 1 - prev.time + after.time; into = fraction + 1 - prev.time }
            else -> { prev = keys[next - 1]; after = keys[next]; span = after.time - prev.time; into = fraction - prev.time }
        }
        return Bracket(prev.frame, after.frame, if (span > 1e-9) (into / span).coerceIn(0.0, 1.0) else 0.0)
    }

    /** Ground-level sky for a point in the day: the first sky track that has keys, else the first sky frame, else defaults. */
    fun skyAt(cycle: Map<String, Any?>?, fraction: Double): Sky {
        if (cycle == null) return DEFAULT_SKY
        for (track in 1..4) bracket(cycle, track, fraction)?.let { return blendSky(normalizeSky(it.a), normalizeSky(it.b), it.t) }
        val frames = cycle["frames"].asLlsdMap()?.values.orEmpty()
        val sky = frames.firstNotNullOfOrNull { f -> f.asLlsdMap()?.takeIf { pick(it, "type") == "sky" || pick(it, "sunlightColor", "sunlight_color") != null } }
        return if (sky != null) normalizeSky(sky) else DEFAULT_SKY
    }

    fun waterAt(cycle: Map<String, Any?>?, fraction: Double): Water {
        if (cycle != null) {
            bracket(cycle, 0, fraction)?.let { return blendWater(normalizeWater(it.a), normalizeWater(it.b), it.t) }
            val frames = cycle["frames"].asLlsdMap()?.values.orEmpty()
            val w = frames.firstNotNullOfOrNull { f -> f.asLlsdMap()?.takeIf { pick(it, "type") == "water" || pick(it, "waterFogColor", "water_fog_color") != null } }
            if (w != null) return normalizeWater(w)
        }
        return DEFAULT_WATER
    }

    // ---- derived values -------------------------------------------------------------------------------

    /** World direction of the sun/moon: the +X axis rotated by the quaternion (x, y, z, w). */
    fun directionFrom(q: DoubleArray): DoubleArray {
        val x = q[0]; val y = q[1]; val z = q[2]; val w = q[3]
        val v = doubleArrayOf(1 - 2 * (y * y + z * z), 2 * (x * y + w * z), 2 * (x * z - w * y))
        val n = sqrt(v.sumOf { it * it })
        return if (n > 1e-9) DoubleArray(3) { v[it] / n } else doubleArrayOf(0.0, 0.0, 1.0)
    }

    private const val LIGHT_LIMIT = 1.1920929e-7 * 8

    fun skyState(sky: Sky, sun: DoubleArray? = null, moon: DoubleArray? = null): SkyState {
        fun unit(v: DoubleArray?): DoubleArray? {
            if (v == null || !v.all { it.isFinite() }) return null
            val n = sqrt(v.sumOf { it * it })
            return if (n > 1e-9) DoubleArray(3) { v[it] / n } else null
        }
        val sunDir = unit(sun) ?: directionFrom(sky.sunRotation)
        val moonDir = unit(moon) ?: directionFrom(sky.moonRotation)
        val sunUp = sunDir[2] >= 0; val moonUp = moonDir[2] >= 0
        val light = if (sunUp) sunDir else moonDir
        val glow = if (sunUp) 1.0 else if (moonUp) sky.moonBrightness * 0.25 else 0.0
        val lightAtten = DoubleArray(3) { (sky.blueDensity[it] + sky.hazeDensity * 0.25) * sky.densityMultiplier * sky.maxY }
        val transmittance = DoubleArray(3) { exp(-(sky.blueDensity[it] + sky.hazeDensity) * sky.densityMultiplier * sky.maxY) }
        var lighty = abs(light[2])
        if (lighty >= LIGHT_LIMIT) lighty = 1 / lighty
        lighty = max(LIGHT_LIMIT, lighty)
        fun attenuate(c: DoubleArray) = DoubleArray(3) { c[it] * exp(-lightAtten[it] * lighty) * transmittance[it] }
        val sunDiffuse = attenuate(sky.sunlightColor)
        val sunAmbient = DoubleArray(3) { sky.ambient[it] + (1 - sky.ambient[it]) * sky.cloudShadow * 0.5 }
        val moonBrightness = if (moonUp) sky.moonBrightness else 0.001
        val moonDiffuse = attenuate(sky.sunlightColor).map { it * moonBrightness }.toDoubleArray()
        val moonAmbient = doubleArrayOf(0.66 * 0.0125, 0.66 * 0.0125, 1.2 * 0.0125)
        return SkyState(sunDir, moonDir, sunUp, moonUp, light, glow, sunDiffuse, sunAmbient, moonDiffuse, moonAmbient)
    }

    /** The sky colour looking along [dir] (before tone mapping), the CPU twin of the sky shader. */
    fun atmosphereColor(sky: Sky, state: SkyState, dirIn: DoubleArray): DoubleArray {
        val n = sqrt(dirIn.sumOf { it * it }).let { if (it == 0.0) 1.0 else it }
        val dv = DoubleArray(3) { dirIn[it] / n }
        var rel = doubleArrayOf(dv[0] * 15000, dv[1] * 15000, dv[2] * 15000 + 50)
        if (rel[2] > 0) { val k = sky.maxY / rel[2]; rel = DoubleArray(3) { rel[it] * k } }
        else if (rel[2] < 0) { val k = -32000 / rel[2]; rel = DoubleArray(3) { rel[it] * k } }
        val relLen = sqrt(rel.sumOf { it * it })
        val relNorm = DoubleArray(3) { rel[it] / relLen }
        val light = state.lightDirection
        val lightDot = relNorm[0] * light[0] + relNorm[1] * light[1] + relNorm[2] * light[2]
        val sunScale = if (state.sunUp) 1.0 else 0.7
        val blue = sky.blueDensity; val haze = sky.hazeDensity
        val combined = DoubleArray(3) { max(abs(blue[it]) + abs(haze), 1e-6) }
        val blueWeight = DoubleArray(3) { blue[it] / combined[it] }
        val hazeWeight = DoubleArray(3) { haze / combined[it] }
        val offAxis = 1 / max(1e-6, max(0.0, relNorm[2]) + light[2])
        val sunlight = DoubleArray(3) { sky.sunlightColor[it] * sunScale * exp(-((blue[it] + haze * 0.25) * sky.densityMultiplier * sky.maxY) * offAxis) }
        val transmittance = DoubleArray(3) { exp(-combined[it] * relLen * sky.densityMultiplier) }
        var glow = max(1 - lightDot, 0.001) * sky.glow[0]
        glow = glow.pow(sky.glow[2])
        glow = if (state.sunMoonGlowFactor < 1) 0.0 else state.sunMoonGlowFactor * (glow + 0.25)
        val above = DoubleArray(3) { (sky.blueHorizon[it] * blueWeight[it] * (sunlight[it] + sky.ambient[it]) + sky.hazeHorizon * hazeWeight[it] * (sunlight[it] * glow + sky.ambient[it])) * (1 - transmittance[it]) }
        val ambient = DoubleArray(3) { sky.ambient[it] + max(0.0, 1 - sky.ambient[it]) * sky.cloudShadow * 0.5 }
        val dimmed = DoubleArray(3) { sunlight[it] * max(0.0, 1 - sky.cloudShadow) }
        val below = DoubleArray(3) { sky.blueHorizon[it] * blueWeight[it] * (dimmed[it] + ambient[it]) + sky.hazeHorizon * hazeWeight[it] * (dimmed[it] * glow + ambient[it]) }
        return DoubleArray(3) {
            val blend = 1 - transmittance[it].pow(0.25)
            min(5.0, max(0.0, (above[it] + (below[it] - above[it]) * blend) * 2))
        }
    }

    /** Display colour for a sky radiance, as the sky shader's soft clip and gamma. */
    fun toneMapSky(c: DoubleArray) = DoubleArray(3) { (1 - exp(-c[it] * 1.2)).pow(1 / 2.2) }
}
