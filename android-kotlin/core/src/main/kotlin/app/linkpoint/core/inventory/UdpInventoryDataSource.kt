package app.linkpoint.core.inventory

class UdpInventoryDataSource {
    val operationLog = mutableListOf<String>()

    fun copyFolder(folderId: String, targetFolderId: String): String {
        val resultId = "udp-copy-$folderId"
        operationLog.add("UDP:MoveInventoryFolder(folderId=$folderId, targetFolderId=$targetFolderId, copy=true)")
        return resultId
    }

    fun moveFolder(folderId: String, targetFolderId: String): String {
        operationLog.add("UDP:MoveInventoryFolder(folderId=$folderId, targetFolderId=$targetFolderId, copy=false)")
        return folderId
    }

    fun moveItem(itemId: String, targetFolderId: String): String {
        operationLog.add("UDP:MoveInventoryItem(itemId=$itemId, targetFolderId=$targetFolderId)")
        return itemId
    }

    fun createFolder(parentId: String, name: String, folderType: Int = -1): String {
        val newFolderId = "udp-folder-$name-$parentId"
        operationLog.add("UDP:CreateInventoryFolder(parentId=$parentId, name=$name, type=$folderType)")
        return newFolderId
    }

    fun deleteFolder(folderId: String): Boolean {
        operationLog.add("UDP:RemoveInventoryFolder(folderId=$folderId)")
        return true
    }

    fun deleteItem(itemId: String): Boolean {
        operationLog.add("UDP:RemoveInventoryItem(itemId=$itemId)")
        return true
    }
}
