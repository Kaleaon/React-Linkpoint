package app.linkpoint.core.inventory

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

open class AisHttpException(
    val statusCode: Int,
    message: String,
    cause: Throwable? = null
) : Exception(message, cause)

class AisCapabilityUnavailableException(
    statusCode: Int,
    message: String,
    cause: Throwable? = null
) : AisHttpException(statusCode, message, cause)

@Serializable
data class AisEmbeddedItem(
    val item_id: String? = null,
    val id: String? = null,
    val asset_id: String? = null,
    val name: String? = null
)

@Serializable
data class AisEmbeddedLink(
    val item_id: String? = null,
    val id: String? = null,
    val target_id: String? = null
)

@Serializable
data class AisEmbeddedPayload(
    val items: List<AisEmbeddedItem>? = null,
    val links: List<AisEmbeddedLink>? = null,
    val categories: List<AisEmbeddedItem>? = null
)

@Serializable
data class AisEmbeddedResponse(
    val _embedded: AisEmbeddedPayload? = null,
    val item_id: String? = null,
    val id: String? = null
)

@Serializable
data class AisItemEmbeddedMap(
    val _embedded: Map<String, JsonElement>? = null
)

interface AisOperations {
    suspend fun copyCategory(folderId: String, targetFolderId: String): String
    suspend fun moveCategory(folderId: String, targetFolderId: String): String
    suspend fun createFolder(parentId: String, name: String, folderType: Int = -1): String
    suspend fun deleteFolder(folderId: String): Boolean
    suspend fun deleteItem(itemId: String): Boolean
    suspend fun postInventory(folderId: String, jsonPayload: String): String
}

interface AisTransport {
    suspend fun execute(
        method: String,
        url: String,
        body: String? = null,
        headers: Map<String, String> = emptyMap()
    ): AisHttpResponse
}

data class AisHttpResponse(
    val statusCode: Int,
    val body: String
)

class OkHttpAisTransport(
    private val httpClient: (method: String, url: String, body: String?, headers: Map<String, String>) -> AisHttpResponse
) : AisTransport {
    override suspend fun execute(
        method: String,
        url: String,
        body: String?,
        headers: Map<String, String>
    ): AisHttpResponse {
        val response = httpClient(method, url, body, headers)
        if (response.statusCode == 405 || response.statusCode == 501) {
            throw AisCapabilityUnavailableException(
                response.statusCode,
                "WebDAV verb $method unavailable or blocked by grid endpoint: HTTP ${response.statusCode}"
            )
        }
        if (response.statusCode !in 200..299) {
            throw AisHttpException(
                response.statusCode,
                "AIS HTTP $method request failed with status code ${response.statusCode}"
            )
        }
        return response
    }
}

class AisClient(
    private val transport: AisTransport,
    private val capabilityUrl: String
) : AisOperations {

    private val json = Json {
        ignoreUnknownKeys = true
        isLenient = true
    }

    override suspend fun copyCategory(folderId: String, targetFolderId: String): String {
        val response = transport.execute(
            method = "COPY",
            url = "$capabilityUrl/category/$folderId",
            headers = mapOf("Destination" to "$capabilityUrl/category/$targetFolderId")
        )
        return extractIdFromResponse(response.body, folderId)
    }

    override suspend fun moveCategory(folderId: String, targetFolderId: String): String {
        val response = transport.execute(
            method = "MOVE",
            url = "$capabilityUrl/category/$folderId",
            headers = mapOf("Destination" to "$capabilityUrl/category/$targetFolderId")
        )
        return extractIdFromResponse(response.body, folderId)
    }

    override suspend fun createFolder(parentId: String, name: String, folderType: Int): String {
        val bodyPayload = """{"name":"$name","folder_type":$folderType,"parent_id":"$parentId"}"""
        val response = transport.execute(
            method = "POST",
            url = "$capabilityUrl/category/$parentId",
            body = bodyPayload,
            headers = mapOf("Content-Type" to "application/json")
        )
        return extractIdFromResponse(response.body, parentId)
    }

    override suspend fun deleteFolder(folderId: String): Boolean {
        val response = transport.execute(
            method = "DELETE",
            url = "$capabilityUrl/category/$folderId"
        )
        return response.statusCode in 200..299
    }

    override suspend fun deleteItem(itemId: String): Boolean {
        val response = transport.execute(
            method = "DELETE",
            url = "$capabilityUrl/item/$itemId"
        )
        return response.statusCode in 200..299
    }

    override suspend fun postInventory(folderId: String, jsonPayload: String): String {
        val response = transport.execute(
            method = "POST",
            url = "$capabilityUrl/category/$folderId",
            body = jsonPayload,
            headers = mapOf("Content-Type" to "application/json")
        )
        return extractIdFromResponse(response.body, folderId)
    }

    fun parseEmbeddedPayload(responseBody: String): AisEmbeddedResponse {
        if (responseBody.isBlank()) return AisEmbeddedResponse()
        return try {
            json.decodeFromString<AisEmbeddedResponse>(responseBody)
        } catch (e: Exception) {
            AisEmbeddedResponse()
        }
    }

    private fun extractIdFromResponse(responseBody: String, fallbackId: String): String {
        if (responseBody.isBlank()) return fallbackId
        val decoded = parseEmbeddedPayload(responseBody)
        decoded.item_id?.let { return it }
        decoded.id?.let { return it }

        decoded._embedded?.let { embedded ->
            embedded.items?.firstOrNull()?.let { item ->
                item.item_id?.let { return it }
                item.id?.let { return it }
            }
            embedded.links?.firstOrNull()?.let { link ->
                link.item_id?.let { return it }
                link.id?.let { return it }
            }
            embedded.categories?.firstOrNull()?.let { cat ->
                cat.id?.let { return it }
                cat.item_id?.let { return it }
            }
        }

        // Try map-based decoding fallback for custom vendor formats
        return try {
            val mapResponse = json.decodeFromString<AisItemEmbeddedMap>(responseBody)
            mapResponse._embedded?.let { map ->
                for ((_, element) in map) {
                    if (element is kotlinx.serialization.json.JsonArray) {
                        for (item in element) {
                            val obj = item.jsonObject
                            val idVal = obj["item_id"]?.jsonPrimitive?.content
                                ?: obj["id"]?.jsonPrimitive?.content
                                ?: obj["asset_id"]?.jsonPrimitive?.content
                            if (idVal != null && idVal.isNotEmpty()) return idVal
                        }
                    }
                }
            }
            fallbackId
        } catch (e: Exception) {
            fallbackId
        }
    }

    private fun String?.isNull_or_Empty(): Boolean = this == null || this.isEmpty()
}
