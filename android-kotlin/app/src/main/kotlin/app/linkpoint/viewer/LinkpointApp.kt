package app.linkpoint.viewer

import android.app.Application

class LinkpointApp : Application() {
    lateinit var host: ViewerHost
        private set

    override fun onCreate() {
        super.onCreate()
        com.google.android.filament.Filament.init() // load the native renderer library
        host = ViewerHost(this)
    }
}
