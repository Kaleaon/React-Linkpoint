package app.linkpoint.viewer.ui.components

import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.SemanticsConfiguration
import androidx.compose.ui.semantics.SemanticsModifier
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.unit.dp
import app.linkpoint.viewer.ui.crystal.CrystalLoaderVariant
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

class LinkpointLoadingStateTest {

    private fun resolveAppFile(relativePath: String): File {
        val direct = File(relativePath)
        if (direct.exists()) return direct
        return File("app/$relativePath")
    }

    @Test
    fun testLayoutOrientationsAndCrystalVariants() {
        assertEquals(2, LinkpointLoadingLayout.entries.size)
        assertEquals(
            CrystalLoaderVariant.Inline,
            LinkpointLoadingStateDefaults.resolveCrystalVariant(LinkpointLoadingLayout.Inline),
        )
        assertEquals(
            CrystalLoaderVariant.Block,
            LinkpointLoadingStateDefaults.resolveCrystalVariant(LinkpointLoadingLayout.Block),
        )
    }

    @Test
    fun testIndicatorSizeResolution() {
        assertEquals(
            16.dp,
            LinkpointLoadingStateDefaults.resolveIndicatorSize(LinkpointLoadingLayout.Inline),
        )
        assertEquals(
            88.dp,
            LinkpointLoadingStateDefaults.resolveIndicatorSize(LinkpointLoadingLayout.Block),
        )
        assertEquals(
            32.dp,
            LinkpointLoadingStateDefaults.resolveIndicatorSize(LinkpointLoadingLayout.Block, customSize = 32.dp),
        )
        assertEquals(
            20.dp,
            LinkpointLoadingStateDefaults.resolveIndicatorSize(LinkpointLoadingLayout.Inline, customSize = 20.dp),
        )
    }

    @Test
    fun testMinimumTouchTargetGuardrail() {
        assertTrue(
            "Action slot minimum touch target must be at least 48.dp",
            LinkpointLoadingStateDefaults.MIN_ACTION_TOUCH_TARGET >= 48.dp,
        )
        assertEquals(48.dp, LinkpointLoadingStateDefaults.MIN_ACTION_TOUCH_TARGET)
    }

    @Test
    fun testContentDescriptionResolutionPrecedence() {
        // Explicit contentDescription takes precedence over label and fallback
        assertEquals(
            "Loading folder contents",
            LinkpointLoadingStateDefaults.resolveContentDescription(
                contentDescription = "Loading folder contents",
                label = "Loading…",
                fallbackDescription = "Default loading",
            ),
        )

        // Falls back to label when contentDescription is null or blank
        assertEquals(
            "Loading profile…",
            LinkpointLoadingStateDefaults.resolveContentDescription(
                contentDescription = null,
                label = "Loading profile…",
                fallbackDescription = "Loading…",
            ),
        )
        assertEquals(
            "Retrying failed requests…",
            LinkpointLoadingStateDefaults.resolveContentDescription(
                contentDescription = "   ",
                label = "Retrying failed requests…",
                fallbackDescription = "Loading…",
            ),
        )

        // Falls back to localized default when both contentDescription and label are omitted/blank
        assertEquals(
            "Loading…",
            LinkpointLoadingStateDefaults.resolveContentDescription(
                contentDescription = null,
                label = null,
                fallbackDescription = "Loading…",
            ),
        )
        assertEquals(
            "Loading…",
            LinkpointLoadingStateDefaults.resolveContentDescription(
                contentDescription = "",
                label = "  ",
                fallbackDescription = "Loading…",
            ),
        )
    }

    @Test
    fun testPoliteLiveRegionSemanticsConfiguration() {
        val config = SemanticsConfiguration().apply(
            LinkpointLoadingStateDefaults.buildStatusSemantics(
                resolvedDescription = "Loading folder contents",
            )
        )
        assertEquals(LiveRegionMode.Polite, config[SemanticsProperties.LiveRegion])
        assertEquals(listOf("Loading folder contents"), config[SemanticsProperties.ContentDescription])

        val modifier = Modifier.linkpointLoadingStatusSemantics(
            resolvedDescription = "Loading profile…",
        )
        val semanticsModifier = modifier as SemanticsModifier
        val modConfig = semanticsModifier.semanticsConfiguration
        assertTrue(modConfig.isClearingSemantics)
        assertEquals(LiveRegionMode.Polite, modConfig[SemanticsProperties.LiveRegion])
        assertEquals(listOf("Loading profile…"), modConfig[SemanticsProperties.ContentDescription])
    }

    @Test
    fun testLocalizedStringsExistForAllScenarios() {
        val stringsXml = resolveAppFile("src/main/res/values/strings.xml").readText()

        assertTrue(stringsXml.contains("name=\"loading_state_default\">Loading…<"))
        assertTrue(stringsXml.contains("name=\"loading_folder_contents\">Loading folder contents<"))
        assertTrue(stringsXml.contains("name=\"inventory_folder_item_count\""))
        assertTrue(stringsXml.contains("quantity=\"one\">%d item<"))
        assertTrue(stringsXml.contains("quantity=\"other\">%d items<"))
        assertTrue(stringsXml.contains("name=\"loading_profile\">Loading profile…<"))
        assertTrue(stringsXml.contains("name=\"error_recovery_reconnecting\">Network disconnected. Reconnecting automatically…<"))
        assertTrue(stringsXml.contains("name=\"error_recovery_retrying\">Retrying failed requests…<"))
        assertTrue(stringsXml.contains("name=\"action_retry\">Retry<"))
    }

    @Test
    fun testZeroUnbrandedCircularProgressIndicatorsAndSecondaryViewAdoption() {
        val mainKotlinRoot = resolveAppFile("src/main/kotlin")
        assertTrue("Kotlin source directory must exist", mainKotlinRoot.exists())

        val kotlinFiles = mainKotlinRoot.walkTopDown().filter { it.isFile && it.extension == "kt" }.toList()
        assertTrue(kotlinFiles.isNotEmpty())

        for (file in kotlinFiles) {
            val text = file.readText()
            assertFalse(
                "Unbranded CircularProgressIndicator found in ${file.path}",
                text.contains("CircularProgressIndicator"),
            )
        }

        val infoScreens = resolveAppFile("src/main/kotlin/app/linkpoint/viewer/ui/InfoScreens.kt").readText()
        assertTrue(infoScreens.contains("LinkpointLoadingState("))
        assertTrue(infoScreens.contains("R.string.loading_folder_contents"))
        assertTrue(infoScreens.contains("R.plurals.inventory_folder_item_count"))
        assertTrue(infoScreens.contains("R.string.loading_profile"))
        assertTrue(infoScreens.contains("LiveRegionMode.Polite"))

        val errorRecovery = resolveAppFile("src/main/kotlin/app/linkpoint/viewer/ui/ErrorRecoveryComponents.kt").readText()
        assertTrue(errorRecovery.contains("LinkpointLoadingState("))
        assertTrue(errorRecovery.contains("LinkpointLoadingLayout.Inline"))
        assertTrue(errorRecovery.contains("R.string.error_recovery_reconnecting"))
        assertTrue(errorRecovery.contains("R.string.error_recovery_retrying"))
    }
}
