package app.linkpoint.core.net

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * Interface and basic implementation for tracking network connectivity state.
 */
interface NetworkMonitor {
    val isOnline: StateFlow<Boolean>
    fun setOnlineStatus(online: Boolean)
}

class BasicNetworkMonitor(initialOnline: Boolean = true) : NetworkMonitor {
    private val _isOnline = MutableStateFlow(initialOnline)
    override val isOnline: StateFlow<Boolean> = _isOnline.asStateFlow()

    override fun setOnlineStatus(online: Boolean) {
        _isOnline.value = online
    }
}
