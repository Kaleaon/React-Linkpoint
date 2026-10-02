package app.linkpoint.core.env

/** Sky, water and derived light at one moment. */
class EnvSample(val sky: Sky, val water: Water, val state: SkyState, val estimated: Boolean) {
    /** Direction towards the light that lights surfaces (sun by day, moon at night). */
    val lightDirection get() = state.lightDirection
    val lightColor get() = if (state.sunUp) state.sunDiffuse else state.moonDiffuse
    val ambientColor get() = if (state.sunUp) state.sunAmbient else state.moonAmbient
}

/**
 * The region's environment: the day cycle the simulator sent (EEP), or, until it has, the
 * bundled Windlight presets at an estimated time of day ([estimated] is true then).
 */
class RegionEnvironment(private val cycle: Map<String, Any?>?, private val dayLength: Double, private val dayOffset: Double) {
    val estimated: Boolean get() = cycle == null

    fun sample(nowSeconds: Double): EnvSample {
        if (cycle == null) {
            val hour = Windlight.estimatedSunHour((nowSeconds * 1000).toLong())
            val (sky, sun) = Windlight.sky(hour)
            val state = Env.skyState(sky, sun, doubleArrayOf(-sun[0], -sun[1], -sun[2]))
            return EnvSample(sky, Env.DEFAULT_WATER, state, true)
        }
        val f = Env.dayFraction(nowSeconds, dayLength, dayOffset)
        val sky = Env.skyAt(cycle, f)
        return EnvSample(sky, Env.waterAt(cycle, f), Env.skyState(sky), false)
    }

    companion object {
        /** Used before the region has answered. */
        val FALLBACK = RegionEnvironment(null, 14400.0, 0.0)

        /** Parse an ExtEnvironment capability response. Returns null if it carries no day cycle. */
        fun fromLlsd(root: Map<String, Any?>?): RegionEnvironment? {
            @Suppress("UNCHECKED_CAST")
            val env = (root?.get("environment") as? Map<String, Any?>) ?: root ?: return null
            @Suppress("UNCHECKED_CAST")
            val cycle = env["day_cycle"] as? Map<String, Any?> ?: return null
            val length = (env["day_length"] as? Number)?.toDouble() ?: 14400.0
            val offset = (env["day_offset"] as? Number)?.toDouble() ?: 0.0
            return RegionEnvironment(cycle, length, offset)
        }
    }
}
