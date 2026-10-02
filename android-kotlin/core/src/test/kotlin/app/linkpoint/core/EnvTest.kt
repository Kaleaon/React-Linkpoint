package app.linkpoint.core

import app.linkpoint.core.env.Env
import app.linkpoint.core.env.Windlight
import kotlinx.serialization.json.*
import org.junit.Assert.*
import org.junit.Test
import kotlin.math.abs
import kotlin.math.pow

/**
 * env_ref.json holds the output of the TypeScript implementation (src/linkpoint/eep.ts and
 * atmosphere.ts, run with tsx; the script is tools/env_ref.ts.txt) for one day cycle at several
 * times of day. The Kotlin port must reproduce those numbers.
 */
class EnvTest {
    private val ref = Json.parseToJsonElement(javaClass.getResourceAsStream("/env_ref.json")!!.readBytes().toString(Charsets.UTF_8)).jsonObject

    private fun toKotlin(e: JsonElement): Any? = when (e) {
        is JsonNull -> null
        is JsonPrimitive -> if (e.isString) e.content else e.booleanOrNull ?: e.content.toDouble()
        is JsonArray -> e.map { toKotlin(it) }
        is JsonObject -> e.mapValues { toKotlin(it.value) }
    }

    private fun arr(e: JsonElement) = e.jsonArray.map { it.jsonPrimitive.double }.toDoubleArray()
    private fun near(what: String, expected: DoubleArray, actual: DoubleArray, eps: Double = 1e-6) {
        assertEquals("$what length", expected.size, actual.size)
        for (i in expected.indices) assertTrue("$what[$i]: expected ${expected[i]} got ${actual[i]}", abs(expected[i] - actual[i]) <= eps * maxOf(1.0, abs(expected[i])))
    }

    @Test fun skyWaterAndAtmosphereMatchTheTypeScriptPort() {
        @Suppress("UNCHECKED_CAST")
        val cycle = toKotlin(ref["cycle"]!!) as Map<String, Any?>
        val fractions = ref["out"]!!.jsonObject["fractions"]!!.jsonObject
        assertTrue(fractions.size >= 7)
        for ((key, v) in fractions) {
            val f = key.toDouble(); val e = v.jsonObject
            val sky = Env.skyAt(cycle, f); val state = Env.skyState(sky); val water = Env.waterAt(cycle, f)
            near("$f sunlight", arr(e["sunlightColor"]!!), sky.sunlightColor)
            near("$f ambient", arr(e["ambient"]!!), sky.ambient)
            near("$f blueHorizon", arr(e["blueHorizon"]!!), sky.blueHorizon)
            assertEquals(e["hazeDensity"]!!.jsonPrimitive.double, sky.hazeDensity, 1e-9)
            assertEquals(e["maxY"]!!.jsonPrimitive.double, sky.maxY, 1e-6)
            near("$f sunRotation", arr(e["sunRotation"]!!), sky.sunRotation)
            assertEquals(e["moonBrightness"]!!.jsonPrimitive.double, sky.moonBrightness, 1e-9)
            near("$f sunDirection", arr(e["sunDirection"]!!), state.sunDirection)
            near("$f light", arr(e["lightDirection"]!!), state.lightDirection)
            assertEquals(e["sunUp"]!!.jsonPrimitive.boolean, state.sunUp)
            assertEquals(e["glowFactor"]!!.jsonPrimitive.double, state.sunMoonGlowFactor, 1e-9)
            near("$f sunDiffuse", arr(e["sunDiffuse"]!!), state.sunDiffuse)
            near("$f sunAmbient", arr(e["sunAmbient"]!!), state.sunAmbient)
            near("$f moonDiffuse", arr(e["moonDiffuse"]!!), state.moonDiffuse)
            near("$f waterFog", arr(e["waterFog"]!!), water.fogColor)
            assertEquals(e["waterDensity"]!!.jsonPrimitive.double, water.fogDensity, 1e-9)
            assertEquals(e["fresnelScale"]!!.jsonPrimitive.double, water.fresnelScale, 1e-9)
            val dirs = listOf(doubleArrayOf(0.0, 0.0, 1.0), doubleArrayOf(1.0, 0.0, 0.1), doubleArrayOf(0.0, 1.0, 0.5), doubleArrayOf(-1.0, -1.0, 0.02), doubleArrayOf(0.3, 0.2, 0.9), doubleArrayOf(0.0, 0.0, -1.0))
            val expected = e["atmosphere"]!!.jsonArray
            for ((i, d) in dirs.withIndex()) near("$f atmosphere $d", arr(expected[i]), Env.atmosphereColor(sky, state, d))
        }
    }

    @Test fun dayFractionWraps() {
        val e = ref["out"]!!.jsonObject["dayFraction"]!!.jsonArray.map { it.jsonPrimitive.double }
        assertEquals(e[0], Env.dayFraction(1000.0, 14400.0, 0.0), 1e-12)
        assertEquals(e[1], Env.dayFraction(-5.0, 14400.0, 100.0), 1e-12)
        assertEquals(e[2], Env.dayFraction(30000.0, 7200.0, 99.0), 1e-12)
    }

    @Test fun missingSettingsFallBackToViewerDefaults() {
        val s = Env.normalizeSky(emptyMap())
        assertArrayEquals(Env.DEFAULT_SKY.sunlightColor, s.sunlightColor, 0.0)
        assertSame(Env.DEFAULT_SKY, Env.skyAt(null, 0.3))
        assertArrayEquals(Env.DEFAULT_WATER.fogColor, Env.waterAt(null, 0.3).fogColor, 0.0)
        // Sun overhead by default: a day sky.
        assertTrue(Env.skyState(Env.DEFAULT_SKY).sunUp)
    }

    @Test fun windlightFallbackFollowsLumiyaRules() {
        val noon = Windlight.at(0.5)
        // Ambient: the 12PM preset's 1.05 / 3, gamma 1/2.2, x1.25.
        assertEquals((1.05 / 3).pow(1 / 2.2) * 1.25, noon.ambient[0], 1e-4)
        // Between presets the values interpolate; at midnight and 3 AM the sun is below the horizon.
        val (_, midnightSun) = Windlight.sky(0.0)
        assertTrue("midnight sun should be down", midnightSun[2] < 0)
        val (daySky, noonSun) = Windlight.sky(0.5)
        assertTrue("noon sun should be up", noonSun[2] > 0.5)
        val st = Env.skyState(daySky, noonSun, doubleArrayOf(-noonSun[0], -noonSun[1], -noonSun[2]))
        assertTrue(st.sunUp && !st.moonUp)
        // Periodic: the hour wraps.
        assertEquals(Windlight.at(0.25).ambient[1], Windlight.at(1.25).ambient[1], 1e-9)
        assertEquals(0.25, Windlight.estimatedSunHour(3600_000L), 1e-9)
        // The sky is blue overhead by day and darker at night.
        val dayBlue = Env.atmosphereColor(daySky, st, doubleArrayOf(0.0, 0.0, 1.0))
        assertTrue(dayBlue[2] > dayBlue[0])
        val (nightSky, nightSun) = Windlight.sky(0.0)
        val ns = Env.skyState(nightSky, nightSun, doubleArrayOf(-nightSun[0], -nightSun[1], -nightSun[2]))
        val night = Env.atmosphereColor(nightSky, ns, doubleArrayOf(0.0, 0.0, 1.0))
        assertTrue("night sky ${night.toList()} should be darker than day ${dayBlue.toList()}", night.sum() < dayBlue.sum())
    }
}
