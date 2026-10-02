package app.linkpoint.core.env

import app.linkpoint.core.llsd.Llsd
import app.linkpoint.core.llsd.asLlsdMap
import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.pow
import kotlin.math.sin

/**
 * The eight default Windlight sky presets (text LLSD XML) used when the region sends no
 * environment. The scale factors and gamma follow Lumiya's loading rules: ambient and sunlight
 * are divided by 3, blue density/horizon by 2, haze density/horizon by 5; ambient and sunlight are
 * then gamma encoded and scaled by 1.25. The day is eight presets at three hour steps, linearly
 * interpolated with wraparound.
 *
 * The time of day is an ESTIMATE from the clock (the simulator's sun phase is not read), so this
 * sky can disagree with the region's real sun.
 */
object Windlight {
    private val FILES = listOf("A-12AM", "A-3AM", "A-6AM", "A-9AM", "A-12PM", "A-3PM", "A-6PM", "A-9PM")
    private val HOURS = doubleArrayOf(0.0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875)
    const val SL_DAY_SECONDS = 4 * 60 * 60.0

    class Preset(
        val ambient: DoubleArray, val sunlight: DoubleArray, val blueDensity: DoubleArray, val blueHorizon: DoubleArray,
        val hazeDensity: Double, val hazeHorizon: Double, val cloudColor: DoubleArray, val starBrightness: Double,
        val sunAngle: Double, val eastAngle: Double,
    )

    private fun parse(xml: String): Preset {
        val m = Llsd.parseXml(xml).asLlsdMap() ?: error("Windlight preset is not a map")
        fun vec(key: String, div: Double, gamma: Boolean = false): DoubleArray {
            val l = (m[key] as? List<*>) ?: error("Windlight preset is missing \"$key\"")
            return DoubleArray(3) {
                val x = (l[it] as Number).toDouble() / div
                if (gamma) x.pow(1 / 2.2) * 1.25 else x
            }
        }
        fun first(key: String, div: Double) = (((m[key] as? List<*>) ?: error("missing $key"))[0] as Number).toDouble() / div
        return Preset(
            vec("ambient", 3.0, true), vec("sunlight_color", 3.0, true), vec("blue_density", 2.0), vec("blue_horizon", 2.0),
            first("haze_density", 5.0), first("haze_horizon", 5.0), vec("cloud_color", 1.0),
            (m["star_brightness"] as Number).toDouble(), (m["sun_angle"] as Number).toDouble(), (m["east_angle"] as Number).toDouble(),
        )
    }

    private val presets: List<Preset> by lazy {
        FILES.map { name ->
            val text = Windlight::class.java.getResourceAsStream("/windlight/$name.xml")?.use { it.readBytes().toString(Charsets.UTF_8) } ?: error("missing windlight preset $name")
            parse(text)
        }
    }

    private fun lerp(a: Double, b: Double, t: Double) = a * (1 - t) + b * t
    private fun lerp3(a: DoubleArray, b: DoubleArray, t: Double) = DoubleArray(3) { lerp(a[it], b[it], t) }

    /** The preset blend at [hour], a fraction of the day in [0, 1) where 0 is midnight and 0.5 noon. */
    fun at(hour: Double): Preset {
        val f = ((hour % 1) + 1) % 1
        var i = 0
        for (k in HOURS.indices.reversed()) if (f >= HOURS[k]) { i = k; break }
        val next = (i + 1) % HOURS.size
        val start = HOURS[i]
        var end = HOURS[next]
        if (end <= start) end += 1
        val t = (f - start) / (end - start)
        val a = presets[i]; val b = presets[next]
        val end2 = if (b.sunAngle < a.sunAngle) b.sunAngle + 2 * PI else b.sunAngle
        return Preset(
            lerp3(a.ambient, b.ambient, t), lerp3(a.sunlight, b.sunlight, t), lerp3(a.blueDensity, b.blueDensity, t), lerp3(a.blueHorizon, b.blueHorizon, t),
            lerp(a.hazeDensity, b.hazeDensity, t), lerp(a.hazeHorizon, b.hazeHorizon, t), lerp3(a.cloudColor, b.cloudColor, t),
            lerp(a.starBrightness, b.starBrightness, t), lerp(a.sunAngle, end2, t) % (2 * PI), lerp(a.eastAngle, b.eastAngle, t),
        )
    }

    /** At sun angle 0 the sun is on the eastern horizon and at pi/2 overhead; the east angle rotates the compass. */
    fun sunDirection(sunAngle: Double, eastAngle: Double): DoubleArray {
        val h = cos(sunAngle)
        return doubleArrayOf(h * cos(eastAngle), h * sin(eastAngle), sin(sunAngle))
    }

    /** Time of day as a fraction of a four hour Second Life day from Unix milliseconds (an estimate; see the class comment). */
    fun estimatedSunHour(nowMs: Long): Double {
        val seconds = nowMs / 1000.0
        return (((seconds % SL_DAY_SECONDS) + SL_DAY_SECONDS) % SL_DAY_SECONDS) / SL_DAY_SECONDS
    }

    /** A sky (and the sun direction it implies) for the hour. */
    fun sky(hour: Double): Pair<Sky, DoubleArray> {
        val p = at(hour)
        val d = Env.DEFAULT_SKY
        val sky = Sky(
            p.sunlight, p.ambient, p.blueHorizon, p.blueDensity, p.hazeHorizon, p.hazeDensity, d.densityMultiplier, d.distanceMultiplier, d.maxY,
            d.glow, d.cloudShadow, d.gamma, d.sunRotation, d.moonRotation, d.moonBrightness, p.starBrightness, d.sunScale, d.moonScale, p.cloudColor,
        )
        return sky to sunDirection(p.sunAngle, p.eastAngle)
    }
}
