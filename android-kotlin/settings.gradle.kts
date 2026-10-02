pluginManagement {
    repositories {
        maven { url = java.net.URI("https://maven-central.storage-download.googleapis.com/maven2/") }
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}
dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        maven { url = java.net.URI("https://maven-central.storage-download.googleapis.com/maven2/") }
        google()
        mavenCentral()
    }
}

rootProject.name = "linkpoint-android"
include(":core", ":app", ":mockgrid")
