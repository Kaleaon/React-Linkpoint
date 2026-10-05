package app.linkpoint.core.inventory

import kotlinx.coroutines.runBlocking
import org.junit.Assert.*
import org.junit.Test

class AisClientTest {

    @Test
    fun testTransportThrowsCapabilityUnavailableOn405And501() = runBlocking {
        val transport405 = OkHttpAisTransport { method, _, _, _ ->
            AisHttpResponse(405, "Method Not Allowed")
        }
        val transport501 = OkHttpAisTransport { method, _, _, _ ->
            AisHttpResponse(501, "Not Implemented")
        }

        try {
            transport405.execute("MOVE", "http://grid.example/ais/category/123")
            fail("Expected AisCapabilityUnavailableException for HTTP 405")
        } catch (e: AisCapabilityUnavailableException) {
            assertEquals(405, e.statusCode)
            assertTrue(e.message!!.contains("MOVE"))
        }

        try {
            transport501.execute("COPY", "http://grid.example/ais/category/123")
            fail("Expected AisCapabilityUnavailableException for HTTP 501")
        } catch (e: AisCapabilityUnavailableException) {
            assertEquals(501, e.statusCode)
            assertTrue(e.message!!.contains("COPY"))
        }
    }

    @Test
    fun testAisClientThrowsCapabilityUnavailableExceptionOnWebDavVerbError() = runBlocking {
        val transport = OkHttpAisTransport { _, _, _, _ ->
            AisHttpResponse(405, "Method Not Allowed")
        }
        val aisClient = AisClient(transport, "http://grid.example/ais")

        try {
            aisClient.copyCategory("folder-1", "folder-2")
            fail("Expected AisCapabilityUnavailableException")
        } catch (e: AisCapabilityUnavailableException) {
            assertEquals(405, e.statusCode)
        }

        try {
            aisClient.moveCategory("folder-1", "folder-2")
            fail("Expected AisCapabilityUnavailableException")
        } catch (e: AisCapabilityUnavailableException) {
            assertEquals(405, e.statusCode)
        }
    }

    @Test
    fun testPostInventoryDeserializesEmbeddedPayloadUsingTypedModels() = runBlocking {
        val jsonResponseBody = """
            {
              "_embedded": {
                "items": [
                  {
                    "item_id": "item-uuid-9999",
                    "name": "New Item",
                    "asset_id": "asset-uuid-8888"
                  }
                ]
              }
            }
        """.trimIndent()

        val transport = OkHttpAisTransport { _, _, _, _ ->
            AisHttpResponse(200, jsonResponseBody)
        }
        val aisClient = AisClient(transport, "http://grid.example/ais")

        val resultId = aisClient.postInventory("folder-1", """{"name":"New Item"}""")
        assertEquals("item-uuid-9999", resultId)
    }

    @Test
    fun testPostInventoryDeserializesEmbeddedLinkUsingTypedModels() = runBlocking {
        val jsonResponseBody = """
            {
              "_embedded": {
                "links": [
                  {
                    "item_id": "link-item-uuid-7777",
                    "target_id": "target-uuid-6666"
                  }
                ]
              }
            }
        """.trimIndent()

        val transport = OkHttpAisTransport { _, _, _, _ ->
            AisHttpResponse(200, jsonResponseBody)
        }
        val aisClient = AisClient(transport, "http://grid.example/ais")

        val resultId = aisClient.postInventory("folder-1", """{"target":"6666"}""")
        assertEquals("link-item-uuid-7777", resultId)
    }

    @Test
    fun testPostInventoryHandlesCustomVendorMapFormatFallback() = runBlocking {
        val jsonResponseBody = """
            {
              "_embedded": {
                "custom_item_key": [
                  {
                    "item_id": "custom-vendor-id-1234"
                  }
                ]
              }
            }
        """.trimIndent()

        val transport = OkHttpAisTransport { _, _, _, _ ->
            AisHttpResponse(200, jsonResponseBody)
        }
        val aisClient = AisClient(transport, "http://grid.example/ais")

        val resultId = aisClient.postInventory("folder-1", """{"name":"Custom"}""")
        assertEquals("custom-vendor-id-1234", resultId)
    }
}
