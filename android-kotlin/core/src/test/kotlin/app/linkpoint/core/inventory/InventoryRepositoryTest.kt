package app.linkpoint.core.inventory

import kotlinx.coroutines.runBlocking
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test

class InventoryRepositoryTest {

    private lateinit var udpDataSource: UdpInventoryDataSource

    @Before
    fun setUp() {
        udpDataSource = UdpInventoryDataSource()
    }

    @Test
    fun testPrimaryAisPathUsedWhenAvailable() = runBlocking {
        val mockAis = object : AisOperations {
            override suspend fun copyCategory(folderId: String, targetFolderId: String): String = "ais-copied-$folderId"
            override suspend fun moveCategory(folderId: String, targetFolderId: String): String = "ais-moved-$folderId"
            override suspend fun createFolder(parentId: String, name: String, folderType: Int): String = "ais-created-$name"
            override suspend fun deleteFolder(folderId: String): Boolean = true
            override suspend fun deleteItem(itemId: String): Boolean = true
            override suspend fun postInventory(folderId: String, jsonPayload: String): String = "ais-posted"
        }

        val repository = InventoryRepository(mockAis, udpDataSource)

        val copyResult = repository.copyCategory("folder-1", "folder-2")
        assertEquals("ais-copied-folder-1", copyResult)

        val moveResult = repository.moveCategory("folder-1", "folder-2")
        assertEquals("ais-moved-folder-1", moveResult)

        val createResult = repository.createFolder("folder-1", "Subfolder", 0)
        assertEquals("ais-created-Subfolder", createResult)

        assertTrue(repository.deleteFolder("folder-1"))
        assertTrue(repository.deleteItem("item-1"))

        assertTrue(udpDataSource.operationLog.isEmpty())
    }

    @Test
    fun testFallbackToUdpWhenAisClientIsNull() = runBlocking {
        val repository = InventoryRepository(null, udpDataSource)

        val copyResult = repository.copyCategory("folder-1", "folder-2")
        assertEquals("udp-copy-folder-1", copyResult)

        val moveResult = repository.moveCategory("folder-1", "folder-2")
        assertEquals("folder-1", moveResult)

        val createResult = repository.createFolder("folder-1", "NewDir", -1)
        assertEquals("udp-folder-NewDir-folder-1", createResult)

        assertTrue(repository.deleteFolder("folder-1"))
        assertTrue(repository.deleteItem("item-1"))

        assertEquals(5, udpDataSource.operationLog.size)
        assertTrue(udpDataSource.operationLog[0].contains("MoveInventoryFolder"))
    }

    @Test
    fun testFallbackToUdpWhenAisCapabilityUnavailableExceptionOccurs() = runBlocking {
        val mockAis = object : AisOperations {
            override suspend fun copyCategory(folderId: String, targetFolderId: String): String {
                throw AisCapabilityUnavailableException(405, "Method Not Allowed")
            }
            override suspend fun moveCategory(folderId: String, targetFolderId: String): String {
                throw AisCapabilityUnavailableException(501, "Not Implemented")
            }
            override suspend fun createFolder(parentId: String, name: String, folderType: Int): String {
                throw AisCapabilityUnavailableException(405, "Method Not Allowed")
            }
            override suspend fun deleteFolder(folderId: String): Boolean {
                throw AisCapabilityUnavailableException(405, "Method Not Allowed")
            }
            override suspend fun deleteItem(itemId: String): Boolean {
                throw AisCapabilityUnavailableException(405, "Method Not Allowed")
            }
            override suspend fun postInventory(folderId: String, jsonPayload: String): String = "ais-posted"
        }

        val repository = InventoryRepository(mockAis, udpDataSource)

        val copyResult = repository.copyCategory("folder-1", "folder-2")
        assertEquals("udp-copy-folder-1", copyResult)

        val moveResult = repository.moveCategory("folder-1", "folder-2")
        assertEquals("folder-1", moveResult)

        val createResult = repository.createFolder("folder-1", "NewDir", -1)
        assertEquals("udp-folder-NewDir-folder-1", createResult)

        assertTrue(repository.deleteFolder("folder-1"))
        assertTrue(repository.deleteItem("item-1"))

        assertEquals(5, udpDataSource.operationLog.size)
        assertTrue(udpDataSource.operationLog[0].contains("MoveInventoryFolder"))
        assertTrue(udpDataSource.operationLog[1].contains("MoveInventoryFolder"))
        assertTrue(udpDataSource.operationLog[2].contains("CreateInventoryFolder"))
        assertTrue(udpDataSource.operationLog[3].contains("RemoveInventoryFolder"))
        assertTrue(udpDataSource.operationLog[4].contains("RemoveInventoryItem"))
    }
}
