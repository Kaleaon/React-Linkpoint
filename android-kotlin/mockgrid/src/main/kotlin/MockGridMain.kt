import app.linkpoint.core.mock.MockGrid

/**
 * Runs the fake grid used by the tests so the Android app (or any viewer) can log in to it.
 *
 *   ./gradlew :mockgrid:run --args="10.0.2.2"      # the address an Android emulator uses for this machine
 *
 * Login URL: http://<host>:9000/login   Any avatar name and password are accepted.
 */
fun main(args: Array<String>) {
    val host = args.firstOrNull() ?: "127.0.0.1"
    MockGrid(httpPort = 9000, simPort = 9001, advertisedHost = host).start().use { grid ->
        println("Mock grid running.")
        println("  login URL : ${grid.loginUrl}")
        println("  region    : ${grid.regionName}")
        println("  press Ctrl-C to stop")
        Thread.currentThread().join()
    }
}
