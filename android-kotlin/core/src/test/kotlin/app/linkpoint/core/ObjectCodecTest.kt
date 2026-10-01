package app.linkpoint.core

import app.linkpoint.core.mock.*
import app.linkpoint.core.net.Msg
import app.linkpoint.core.scene.*
import java.util.UUID
import org.junit.Assert.*
import org.junit.Test

/** Encode an object with the fixture encoders, decode it with the viewer's decoders, compare. */
class ObjectCodecTest {
    private val params = PrimParams(
        pathCurve = 0x20, profileCurve = 0x11, pathBegin = 0.1f, pathEnd = 0.9f, pathScaleX = 0.75f, pathScaleY = 0.5f,
        shearX = 0.1f, shearY = -0.2f, twist = 0.3f, twistBegin = -0.1f, radiusOffset = 0.2f, taperX = 0.25f, taperY = -0.5f,
        revolutions = 2.5f, skew = 0.15f, profileBegin = 0.2f, profileEnd = 0.8f, profileHollow = 0.4f,
    )

    private fun check(o: SimObject, spec: ObjectSpec) {
        assertEquals(spec.localId, o.localId); assertEquals(spec.fullId, o.fullId); assertEquals(spec.pcode, o.pcode)
        assertEquals(spec.position.x, o.position.x, 1e-4f); assertEquals(spec.scale.z, o.scale.z, 1e-4f)
        val p = o.params; val e = spec.params
        assertEquals(e.pathCurve, p.pathCurve); assertEquals(e.profileCurve, p.profileCurve)
        for ((a, b) in listOf(e.pathBegin to p.pathBegin, e.pathEnd to p.pathEnd, e.pathScaleX to p.pathScaleX, e.pathScaleY to p.pathScaleY,
            e.shearX to p.shearX, e.shearY to p.shearY, e.twist to p.twist, e.twistBegin to p.twistBegin, e.radiusOffset to p.radiusOffset,
            e.taperX to p.taperX, e.taperY to p.taperY, e.revolutions to p.revolutions, e.skew to p.skew,
            e.profileBegin to p.profileBegin, e.profileEnd to p.profileEnd, e.profileHollow to p.profileHollow)) assertEquals(a, b, 0.011f)
    }

    private fun spec(extra: ObjectSpec.() -> Unit = {}) = ObjectSpec(
        77, fullId = UUID(5, 77), position = Vec3(10f, 20f, 30f), rotation = Quat.aroundZ(0.8f), scale = Vec3(1f, 2f, 3f), params = params,
        textureEntry = Wire.textureEntry(FaceSpec(UUID(1, 2), floatArrayOf(0.2f, 0.4f, 0.6f, 1f), repeatU = 2f), mapOf(2 to FaceSpec(color = floatArrayOf(1f, 0f, 0f, 0.5f), fullbright = true, glow = 0.5f))),
        sculpt = UUID(8, 8) to 5, text = "label", particles = Wire.particleBlock(textureId = UUID(9, 9)),
    ).also(extra)

    @Test fun fullAndCompressedUpdatesAgree() {
        val s = spec()
        for ((id, body) in listOf(Msg.ObjectUpdate to ObjectPackets.full(s), Msg.ObjectUpdateCompressed to ObjectPackets.compressed(s))) {
            val o = (ObjectDecoder.decode(id, body).single() as ObjectChange.Full).obj
            check(o, s)
            assertEquals("label", o.text)
            assertEquals(UUID(8, 8), o.sculpt!!.assetId); assertEquals(SculptKind.MESH, o.sculpt!!.kind)
            assertEquals(UUID(9, 9), o.particles!!.textureId)
            val te = o.textures!!
            assertEquals(UUID(1, 2), te.face(0).textureId); assertEquals(2f, te.face(0).repeatU, 1e-4f)
            assertEquals(0.5f, te.face(2).color[3], 0.01f); assertTrue(te.face(2).fullbright); assertFalse(te.face(0).fullbright)
            assertEquals(0.5f, te.face(2).glow, 0.01f)
            // Rotation about Z by 0.8 rad survives the packed-quaternion encoding.
            assertEquals(0.8, 2 * Math.asin(o.rotation.z.toDouble()), 1e-3)
        }
    }

    @Test fun parentedObjectsAndAvatars() {
        val child = (ObjectDecoder.decode(Msg.ObjectUpdateCompressed, ObjectPackets.compressed(spec { })).single() as ObjectChange.Full).obj
        assertEquals(0L, child.parentId)
        val linked = ObjectSpec(5, parent = 3, position = Vec3(1f, 0f, 2f))
        assertEquals(3L, (ObjectDecoder.decode(Msg.ObjectUpdateCompressed, ObjectPackets.compressed(linked)).single() as ObjectChange.Full).obj.parentId)
        assertEquals(3L, (ObjectDecoder.decode(Msg.ObjectUpdate, ObjectPackets.full(linked)).single() as ObjectChange.Full).obj.parentId)
        val av = ObjectSpec(9, pcode = PCode.AVATAR, position = Vec3(4f, 5f, 6f))
        val o = (ObjectDecoder.decode(Msg.ObjectUpdate, ObjectPackets.full(av)).single() as ObjectChange.Full).obj
        assertTrue(o.isAvatar); assertEquals(5f, o.position.y, 1e-4f)
    }

    @Test fun textureEntryFaceBitfieldsSpanBytes() {
        // Faces beyond 7 need a two-byte bitfield.
        val te = TextureEntry.parse(Wire.textureEntry(FaceSpec(), mapOf(9 to FaceSpec(color = floatArrayOf(0f, 1f, 0f, 1f)), 3 to FaceSpec(color = floatArrayOf(0f, 1f, 0f, 1f)))))!!
        assertEquals(1f, te.face(9).color[1], 0.01f); assertEquals(1f, te.face(3).color[1], 0.01f); assertEquals(1f, te.face(4).color[0], 0.01f)
    }
}
