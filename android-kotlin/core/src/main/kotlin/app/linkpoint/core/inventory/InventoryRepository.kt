package app.linkpoint.core.inventory

class InventoryRepository(
    private val aisClient: AisOperations?,
    private val udpDataSource: UdpInventoryDataSource
) {
    suspend fun copyCategory(folderId: String, targetFolderId: String): String {
        if (aisClient == null) {
            return udpDataSource.copyFolder(folderId, targetFolderId)
        }
        return try {
            aisClient.copyCategory(folderId, targetFolderId)
        } catch (e: AisCapabilityUnavailableException) {
            udpDataSource.copyFolder(folderId, targetFolderId)
        } catch (e: AisHttpException) {
            if (e.statusCode == 405 || e.statusCode == 501) {
                udpDataSource.copyFolder(folderId, targetFolderId)
            } else {
                throw e
            }
        }
    }

    suspend fun moveCategory(folderId: String, targetFolderId: String): String {
        if (aisClient == null) {
            return udpDataSource.moveFolder(folderId, targetFolderId)
        }
        return try {
            aisClient.moveCategory(folderId, targetFolderId)
        } catch (e: AisCapabilityUnavailableException) {
            udpDataSource.moveFolder(folderId, targetFolderId)
        } catch (e: AisHttpException) {
            if (e.statusCode == 405 || e.statusCode == 501) {
                udpDataSource.moveFolder(folderId, targetFolderId)
            } else {
                throw e
            }
        }
    }

    suspend fun createFolder(parentId: String, name: String, folderType: Int = -1): String {
        if (aisClient == null) {
            return udpDataSource.createFolder(parentId, name, folderType)
        }
        return try {
            aisClient.createFolder(parentId, name, folderType)
        } catch (e: AisCapabilityUnavailableException) {
            udpDataSource.createFolder(parentId, name, folderType)
        } catch (e: AisHttpException) {
            if (e.statusCode == 405 || e.statusCode == 501) {
                udpDataSource.createFolder(parentId, name, folderType)
            } else {
                throw e
            }
        }
    }

    suspend fun deleteFolder(folderId: String): Boolean {
        if (aisClient == null) {
            return udpDataSource.deleteFolder(folderId)
        }
        return try {
            aisClient.deleteFolder(folderId)
        } catch (e: AisCapabilityUnavailableException) {
            udpDataSource.deleteFolder(folderId)
        } catch (e: AisHttpException) {
            if (e.statusCode == 405 || e.statusCode == 501) {
                udpDataSource.deleteFolder(folderId)
            } else {
                throw e
            }
        }
    }

    suspend fun deleteItem(itemId: String): Boolean {
        if (aisClient == null) {
            return udpDataSource.deleteItem(itemId)
        }
        return try {
            aisClient.deleteItem(itemId)
        } catch (e: AisCapabilityUnavailableException) {
            udpDataSource.deleteItem(itemId)
        } catch (e: AisHttpException) {
            if (e.statusCode == 405 || e.statusCode == 501) {
                udpDataSource.deleteItem(itemId)
            } else {
                throw e
            }
        }
    }
}
