package app.linkpoint.core

/**
 * Viewer identity (TPV_COMPLIANCE.md section 1). The login channel must be our own registered
 * name and the version must reflect the actual build. Everything that sends or displays the
 * identity reads it from here.
 */
object ViewerIdentity {
    const val CHANNEL = "Linkpoint Viewer"
    const val VERSION = "2.0.0"
    const val IDENTITY = "$CHANNEL $VERSION"
}
