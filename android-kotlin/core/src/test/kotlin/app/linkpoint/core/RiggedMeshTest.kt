package app.linkpoint.core

import app.linkpoint.core.mock.Wire
import app.linkpoint.core.net.HttpResponse
import app.linkpoint.core.scene.AvatarSkeleton
import app.linkpoint.core.scene.LlMesh
import app.linkpoint.core.scene.MeshFetcher
import kotlinx.coroutines.*
import org.junit.Assert.*
import org.junit.Test

/** Skinned ("rigged") meshes: the joints, bind matrices and per-vertex weights that make mesh avatars and clothing move. */
class RiggedMeshTest {
    private val joints = listOf("mShoulderLeft", "mElbowLeft", "mWristLeft", "mHandThumb1Left")

    private fun bytes(vararg v: Int) = ByteArray(v.size) { v[it].toByte() }
    private fun pair(joint: Int, w: Int) = intArrayOf(joint, w and 0xFF, w ushr 8)

    @Test fun theRigIsDecoded() {
        val mesh = LlMesh.decode(Wire.riggedLimbMesh(joints))
        assertTrue(mesh.hasSkin)
        val skin = mesh.skin!!
        assertEquals(joints, skin.jointNames)
        assertEquals(16, skin.bindShape.size); assertEquals(1f, skin.bindShape[0], 0f); assertEquals(1f, skin.bindShape[15], 0f)
        assertEquals(joints.size, skin.inverseBind.size)
        skin.inverseBind.forEachIndexed { i, m -> assertEquals(16, m.size); assertEquals(-0.25f * i, m[14], 1e-6f) }
        assertEquals(joints.size, skin.altInverseBind!!.size)
        assertEquals(-0.5f * 3, skin.altInverseBind!![3][14], 1e-6f)
        assertEquals(0.125f, skin.pelvisOffset!!, 0f)
        assertTrue("all four are standard avatar joints", skin.unknownJoints.isEmpty())
    }

    @Test fun everyVertexHasNormalisedWeightsOnValidJoints() {
        val face = LlMesh.decode(Wire.riggedLimbMesh(joints)).faces.single()
        assertTrue(face.isRigged)
        assertEquals(12, face.vertexCount)
        assertEquals(12 * 4, face.skinJoints!!.size); assertEquals(12 * 4, face.skinWeights!!.size)
        for (v in 0 until 12) {
            val sum = (0 until 4).sumOf { face.skinWeights!![v * 4 + it].toDouble() }
            assertEquals("vertex $v weights sum to 1", 1.0, sum, 1e-4)
            for (k in 0 until 4) assertTrue(face.skinJoints!![v * 4 + k] in joints.indices)
        }
    }

    @Test fun theWeightFormatIsReadVertexByVertex() {
        val f = LlMesh.decode(Wire.riggedLimbMesh(joints)).faces.single()
        fun w(v: Int) = (0 until 4).map { f.skinJoints!![v * 4 + it] to f.skinWeights!![v * 4 + it] }
        assertEquals(0, w(0)[0].first); assertEquals(1f, w(0)[0].second, 1e-4f)         // ring 0: all on joint 0
        assertEquals(0f, w(0)[1].second, 0f)                                              // unused slots carry no weight
        assertEquals(0.5f, w(5)[0].second, 1e-3f); assertEquals(1, w(5)[1].first); assertEquals(0.5f, w(5)[1].second, 1e-3f) // ring 1: 50/50
        for (k in 0 until 4) { assertEquals(k, w(8)[k].first); assertEquals(0.25f, w(8)[k].second, 1e-3f) }                    // four influences, no terminator
        assertEquals(2, w(9)[1].first)                                                    // data after the four-influence vertex is not shifted
        assertEquals(3, w(11)[0].first); assertEquals(1f, w(11)[0].second, 1e-4f)         // the last vertex
    }

    @Test fun aMeshWithoutARigLoadsUnrigged() {
        val m = LlMesh.decode(Wire.riggedLimbMesh(withSkin = false))
        assertFalse(m.hasSkin); assertNull(m.skin)
        assertFalse(m.faces.single().isRigged) // the Weights are only meaningful with a rig
        val pyramid = LlMesh.decode(Wire.pyramidMesh())
        assertNull(pyramid.skin); assertFalse(pyramid.faces.single().isRigged)
    }

    @Test fun influencesOnJointsTheRigLacksAreDroppedAndTheRestRenormalised() {
        // 12 vertices: joint 9 does not exist (the rig has 4 joints). Vertex 0 keeps only joint 1; the others have nothing valid left.
        val w = java.io.ByteArrayOutputStream()
        fun add(vararg v: Int) = v.forEach { w.write(it) }
        add(*pair(9, 30000)); add(*pair(1, 30000)); add(0xFF)
        repeat(11) { add(*pair(9, 65535)); add(0xFF) }
        val f = LlMesh.decode(Wire.riggedLimbMesh(joints, weights = w.toByteArray())).faces.single()
        assertTrue(f.isRigged)
        assertEquals(1, f.skinJoints!![0]); assertEquals(1f, f.skinWeights!![0], 1e-4f)
        for (k in 0 until 4) assertEquals("a vertex with no usable influence has no weight", 0f, f.skinWeights!![4 + k], 0f)
    }

    @Test fun fourInvalidInfluencesDoNotSpillIntoTheNextVertex() {
        // Vertex 0 has four pairs, all on a joint the rig lacks, and no terminator (four is the maximum). Vertex 1 must
        // still start at its own data: reading on past the dropped pairs would swallow it.
        val out = java.io.ByteArrayOutputStream()
        repeat(4) { pair(9, 1000).forEach { b -> out.write(b) } }
        pair(2, 65535).forEach { out.write(it) }; out.write(0xFF)
        repeat(10) { pair(0, 65535).forEach { b -> out.write(b) }; out.write(0xFF) }
        val f = LlMesh.decode(Wire.riggedLimbMesh(joints, weights = out.toByteArray())).faces.single()
        assertTrue(f.isRigged)
        for (k in 0 until 4) assertEquals(0f, f.skinWeights!![k], 0f)
        assertEquals(2, f.skinJoints!![4]); assertEquals(1f, f.skinWeights!![4], 1e-4f)
        assertEquals(0, f.skinJoints!![8]); assertEquals(1f, f.skinWeights!![8], 1e-4f)
    }

    @Test fun truncatedWeightsLeaveTheGeometryUsableButUnrigged() {
        val m = LlMesh.decode(Wire.riggedLimbMesh(joints, weights = bytes(0, 0xFF, 0xFF, 0xFF, 1, 0x10)))
        assertNotNull(m.skin) // the rig itself is fine
        val f = m.faces.single()
        assertEquals(12, f.vertexCount); assertEquals(48, f.indices.size)
        assertFalse("untrustworthy weights are not used", f.isRigged)
    }

    @Test fun aDamagedSkinBlockStillGivesGeometry() {
        val whole = Wire.riggedLimbMesh(joints)
        val cut = whole.copyOf(whole.size - 20) // the skin block is last, so this clips it
        val m = LlMesh.decode(cut)
        assertTrue("the header still promises a rig", m.hasSkin)
        assertNull(m.skin)
        assertEquals(12, m.faces.single().vertexCount)
        assertFalse(m.faces.single().isRigged)
    }

    @Test fun jointsOutsideTheStandardSkeletonAreReportedNotRejected() {
        val m = LlMesh.decode(Wire.riggedLimbMesh(listOf("mPelvis", "L_UPPER_ARM", "tail_01", "mFaceJaw")))
        assertEquals(listOf("tail_01", "mFaceJaw"), m.skin!!.unknownJoints)
        assertTrue(AvatarSkeleton.isKnown("mHead")); assertTrue(AvatarSkeleton.isKnown("BELLY")); assertFalse(AvatarSkeleton.isKnown("nonsense"))
    }

    @Test fun aRiggedMeshDownloadedThroughTheMeshCapabilityKeepsItsRig() = runBlocking {
        val asset = Wire.riggedLimbMesh(joints)
        val http = FakeHttp { url, _ -> if (url.contains("mesh_id=")) HttpResponse(200, asset) else HttpResponse(404, ByteArray(0)) }
        val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
        val fetcher = MeshFetcher(http, scope, { "http://sim.test/GetMesh2" })
        val d = fetcher.request(Wire.RIGGED_LIMB_ID)!!.await().getOrThrow()
        assertEquals(joints, d.skin!!.jointNames)
        assertTrue(d.faces.single().isRigged)
        assertSame(d, fetcher.peek(Wire.RIGGED_LIMB_ID))
        scope.cancel()
    }
}
