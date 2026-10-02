pluginManagement {
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}
dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        maven { url = java.net.URI("https://repo1.maven.org/maven2/") }
        mavenCentral()
    }
}

rootProject.name = "linkpoint-android"
include(":core", ":app", ":mockgrid")
