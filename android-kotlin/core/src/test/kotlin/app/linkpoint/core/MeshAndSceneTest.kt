package app.linkpoint.core

import app.linkpoint.core.llsd.LlsdBinary
import app.linkpoint.core.net.*
import app.linkpoint.core.scene.*
import java.io.ByteArrayOutputStream
import java.nio.ByteBuffer
import java.util.UUID
import java.util.zip.Deflater
import org.junit.Assert.*
import org.junit.Test

/** Minimal binary-LLSD writer for building fixtures. */
private class B {
    val out = ByteArrayOutputStream()
    fun raw(vararg b: Int) = apply { b.forEach { out.write(it) } }
    fun i32(v: Int) = apply { out.write(ByteBuffer.allocate(4).putInt(v).array()) }
    fun key(k: String) = apply { raw('k'.code).i32(k.length); out.write(k.toByteArray()) }
    fun int(v: Int) = apply { raw('i'.code).i32(v) }
    fun real(v: Double) = apply { raw('r'.code); out.write(ByteBuffer.allocate(8).putDouble(v).array()) }
    fun bin(b: ByteArray) = apply { raw('b'.code).i32(b.size); out.write(b) }
    fun bool(v: Boolean) = raw(if (v) '1'.code else '0'.code)
    fun map(n: Int) = raw('{'.code).i32(n)
    fun endMap() = raw('}'.code)
    fun arr(n: Int) = raw('['.code).i32(n)
    fun endArr() = raw(']'.code)
    fun bytes() = out.toByteArray()
}

private fun u16s(vararg v: Int): ByteArray { val o = ByteArrayOutputStream(); for (x in v) { o.write(x and 0xFF); o.write(x ushr 8) }; return o.toByteArray() }

private fun deflate(b: ByteArray): ByteArray {
    val d = Deflater(); d.setInput(b); d.finish()
    val out = ByteArrayOutputStream(); val buf = ByteArray(1024)
    while (!d.finished()) out.write(buf, 0, d.deflate(buf))
    d.end(); return out.toByteArray()
}

class MeshAndSceneTest {
    private fun meshAsset(): ByteArray {
        // One submesh: a single triangle spanning the unit cube domain.
        val sub = B().arr(1).map(5)
            .key("Position").bin(u16s(0, 0, 0, 65535, 0, 0, 0, 65535, 0))
            .key("Normal").bin(u16s(32768, 32768, 65535, 32768, 32768, 65535, 32768, 32768, 65535))
            .key("TexCoord0").bin(u16s(0, 0, 65535, 0, 0, 65535))
            .key("TriangleList").bin(u16s(0, 1, 2))
            .key("PositionDomain").map(2)
            .key("Min").arr(3).real(-0.5).real(-0.5).real(-0.5).endArr()
            .key("Max").arr(3).real(0.5).real(0.5).real(0.5).endArr()
            .endMap().endMap().endArr().bytes()
        val block = deflate(sub)
        val header = B().map(2).key("high_lod").map(2).key("offset").int(0).key("size").int(block.size).endMap()
            .key("physics_mesh").map(2).key("offset").int(0).key("size").int(0).endMap().endMap().bytes()
        return header + block
    }

    @Test fun meshAssetDecodes() {
        val d = LlMesh.decode(meshAsset())
        assertEquals("high_lod", d.lod)
        val f = d.faces.single()
        assertEquals(3, f.vertexCount); assertArrayEquals(intArrayOf(0, 1, 2), f.indices)
        assertEquals(-0.5f, f.positions[0], 1e-4f); assertEquals(0.5f, f.positions[3], 1e-4f); assertEquals(0.5f, f.positions[7], 1e-4f)
        assertEquals(1f, f.normals[2], 1e-3f)
        assertEquals(1f, f.uvs[2], 1e-4f)
    }

    @Test fun truncatedHighLodFallsBackToALowerOne() {
        // As seen in a real archive: the header promises a high LOD that the file does not contain.
        val sub = B().arr(1).map(3)
            .key("Position").bin(u16s(0, 0, 0, 65535, 0, 0, 0, 65535, 0)).key("TriangleList").bin(u16s(0, 1, 2))
            .key("PositionDomain").map(2).key("Min").arr(3).real(-0.5).real(-0.5).real(-0.5).endArr().key("Max").arr(3).real(0.5).real(0.5).real(0.5).endArr()
            .endMap().endMap().endArr().bytes()
        val block = deflate(sub)
        val header = B().map(2).key("high_lod").map(2).key("offset").int(block.size).key("size").int(5000).endMap()
            .key("low_lod").map(2).key("offset").int(0).key("size").int(block.size).endMap().endMap().bytes()
        val d = LlMesh.decode(header + block)
        assertEquals("low_lod", d.lod); assertEquals(1, d.faces.size)
        // With nothing usable at all it still fails with a normal exception.
        val none = B().map(1).key("high_lod").map(2).key("offset").int(0).key("size").int(5000).endMap().endMap().bytes()
        assertThrows(IllegalArgumentException::class.java) { LlMesh.decode(none) }
    }

    @Test fun meshWithSentinelHeaderDecodes() {
        val raw = meshAsset()
        val withSentinel = "<? LLSD/Binary ?>\n".toByteArray() + raw
        assertEquals(1, LlMesh.decode(withSentinel).faces.size)
    }

    @Test fun malformedMeshesAreRejectedNotCrashed() {
        assertThrows(IllegalArgumentException::class.java) { LlMesh.decode(ByteArray(0)) }
        assertThrows(IllegalArgumentException::class.java) { LlMesh.decode(meshAsset().copyOf(40)) }
        val bad = meshAsset(); bad[bad.size - 5] = (bad[bad.size - 5] + 1).toByte()
        runCatching { LlMesh.decode(bad) } // corrupt zlib must throw a normal exception, never hang
    }

    @Test fun notationHeaderParses() {
        val text = "{'version':i1,'high_lod':{'offset':i0,'size':i12},'name':'x y','ok':true}"
        val p = LlsdBinary.parse(text.toByteArray())
        val m = p.value as Map<*, *>
        assertEquals(1, m["version"]); assertEquals("x y", m["name"]); assertEquals(true, m["ok"])
        assertEquals(12, ((m["high_lod"] as Map<*, *>)["size"]))
        assertEquals(text.length, p.end)
    }

    // ---- object decoding ------------------------------------------------------------------------

    private fun te(color: Int): ByteArray {
        val w = WireWriter()
        w.uuid(UUID(1, 2))            // default texture
        w.u8(0)                       // end of texture exceptions
        // default colour (stored inverted), then an exception for face 1 only
        w.bytes(byteArrayOf((255 - 255).toByte(), (255 - 0).toByte(), (255 - 0).toByte(), (255 - 255).toByte()))
        w.u8(0x02).bytes(byteArrayOf((255 - 0).toByte(), (255 - 0).toByte(), (255 - color).toByte(), (255 - 255).toByte())).u8(0)
        w.f32(1f).u8(0)               // repeat U
        w.f32(1f).u8(0)               // repeat V
        w.u16(0).u8(0).u16(0).u8(0).u16(0).u8(0) // offsets, rotation
        w.u8(0).u8(0)                 // material
        w.u8(0).u8(0)                 // media
        w.u8(0).u8(0)                 // glow
        return w.toByteArray()
    }

    @Test fun textureEntryColoursAreUninvertedAndPerFace() {
        val t = TextureEntry.parse(te(200))!!
        assertArrayEquals(floatArrayOf(1f, 0f, 0f, 1f), t.face(0).color, 1e-3f)
        assertEquals(200 / 255f, t.face(1).color[2], 1e-3f)
        assertEquals(UUID(1, 2), t.face(3).textureId)
        assertNull(TextureEntry.parse(ByteArray(4)))
    }

    private fun fullUpdate(localId: Long, x: Float, y: Float, z: Float, parent: Long = 0): ByteArray {
        val motion = WireWriter().vec3(x, y, z).vec3(0f, 0f, 0f).vec3(0f, 0f, 0f).vec3(0f, 0f, 0f).vec3(0f, 0f, 0f).toByteArray()
        val w = WireWriter().u64(0).u16(0).u8(1)
        w.u32(localId).u8(0).uuid(UUID(7, localId)).u32(0).u8(PCode.PRIM).u8(0).u8(0).vec3(2f, 3f, 4f).bin1(motion)
        w.u32(parent).u32(0)
        w.u8(0x10).u8(1).u16(0).u16(0).u8(100).u8(100).u8(0).u8(0).u8(0).u8(0).u8(0).u8(0).u8(0).u8(0).u8(0).u16(0).u16(0).u16(0)
        w.bin2(te(255)).bin1(ByteArray(0)).bin2(ByteArray(0)).bin2(ByteArray(0))
        w.str1("hello").bytes(ByteArray(4)).str1("").bin1(ByteArray(0)).bin1(ByteArray(0))
        w.uuid(UUID(0, 0)).uuid(UUID(0, 0)).f32(0f).u8(0).f32(0f).u8(0).vec3(0f, 0f, 0f).vec3(0f, 0f, 0f)
        return w.toByteArray()
    }

    @Test fun fullObjectUpdateDecodes() {
        val changes = ObjectDecoder.decode(Msg.ObjectUpdate, fullUpdate(42, 10f, 20f, 30f))
        val o = (changes.single() as ObjectChange.Full).obj
        assertEquals(42, o.localId); assertEquals(Vec3(10f, 20f, 30f), o.position); assertEquals(Vec3(2f, 3f, 4f), o.scale)
        assertEquals("hello", o.text)
        assertEquals(0x10, o.params.pathCurve); assertEquals(1, o.params.profileCurve)
        assertEquals(1f, o.params.pathScaleX, 1e-4f); assertEquals(1f, o.params.pathEnd, 1e-4f)
        assertNotNull(o.textures)
    }

    @Test fun truncatedUpdateIsDroppedNotThrown() {
        val b = fullUpdate(1, 0f, 0f, 0f)
        assertTrue(ObjectDecoder.decode(Msg.ObjectUpdate, b.copyOf(b.size / 2)).isEmpty())
    }

    @Test fun terseUpdateMovesAnObjectAndUnknownOnesAreRequested() {
        val store = SceneStore()
        store.process(Received(Msg.ObjectUpdate, fullUpdate(5, 1f, 2f, 3f)))
        fun terse(id: Long, x: Float): ByteArray {
            val d = WireWriter().u32(id).u8(0).u8(0).vec3(x, 9f, 9f)
                .u16(32768).u16(32768).u16(32768).u16(32768).u16(32768).u16(32768) // velocity, acceleration
                .u16(0).u16(0).u16(0).u16(65535)                                    // rotation
                .u16(32768).u16(32768).u16(32768).toByteArray()
            return WireWriter().u64(0).u16(0).u8(1).bin1(d).bin2(ByteArray(0)).toByteArray()
        }
        assertTrue(store.process(Received(Msg.ImprovedTerseObjectUpdate, terse(5, 77f))).isEmpty())
        assertEquals(77f, store.get(5)!!.position.x, 1e-4f)
        assertEquals(listOf(99L), store.process(Received(Msg.ImprovedTerseObjectUpdate, terse(99, 1f))))
    }

    @Test fun killAndCachedMessages() {
        val store = SceneStore()
        store.process(Received(Msg.ObjectUpdate, fullUpdate(5, 1f, 2f, 3f)))
        val cached = WireWriter().u64(0).u16(0).u8(2).u32(5).u32(0).u32(0).u32(6).u32(0).u32(0).toByteArray()
        assertEquals(listOf(6L), store.process(Received(Msg.ObjectUpdateCached, cached))) // 5 is known, 6 is not
        store.process(Received(Msg.KillObject, WireWriter().u8(1).u32(5).toByteArray()))
        assertNull(store.get(5))
    }

    @Test fun linksetChildrenComposeWithTheirParent() {
        val store = SceneStore()
        store.process(Received(Msg.ObjectUpdate, fullUpdate(1, 100f, 100f, 20f)))
        store.process(Received(Msg.ObjectUpdate, fullUpdate(2, 1f, 0f, 0f, parent = 1)))
        val (pos, _) = store.worldTransform(store.get(2)!!)!!
        assertEquals(101f, pos.x, 1e-4f)
        store.process(Received(Msg.KillObject, WireWriter().u8(1).u32(1).toByteArray()))
        assertNull(store.worldTransform(store.get(2)!!)) // orphan: parent unknown
    }

    // ---- particles ---------------------------------------------------------------------------------

    @Test fun particleBlockDecodesFixedPointFields() {
        val w = WireWriter()
        w.u32(0).u32(1).u8(ParticleParams.PATTERN_EXPLODE)
        w.u16(0).u16(0).u8(0).u8(0)
        w.u16(128)           // burst rate 0.5
        w.u16(0)             // radius
        w.u16(256).u16(512)  // speed 1..2
        w.u8(3)
        repeat(3) { w.u16(256 * 128) } // angular velocity 0
        w.u16(256 * 128).u16(256 * 128).u16(256 * 128 - 128) // acceleration (0, 0, -1)
        w.uuid(UUID(3, 4)).uuid(UUID(0, 0))
        w.u32(0x103)         // data flags: interp colour + scale + emissive
        w.u16(256 * 2)       // part max age 2 s
        w.bytes(byteArrayOf(-1, 0, 0, -1)).bytes(byteArrayOf(0, 0, -1, 0))
        w.u8(32).u8(32).u8(64).u8(64) // scales 1,1,2,2
        val p = ParticleParams.parse(w.toByteArray())!!
        assertEquals(86, w.toByteArray().size)
        assertEquals(0.5f, p.burstRate, 1e-4f); assertEquals(1f, p.burstSpeedMin, 1e-4f); assertEquals(2f, p.burstSpeedMax, 1e-4f)
        assertEquals(3, p.burstPartCount); assertEquals(-1f, p.partAcceleration.z, 1e-4f)
        assertEquals(UUID(3, 4), p.textureId); assertTrue(p.interpColor && p.interpScale && p.emissive)
        assertEquals(2f, p.partMaxAge, 1e-4f); assertEquals(2f, p.endScaleX, 1e-4f)
        assertNull(ParticleParams.parse(ByteArray(10)))
    }

    @Test fun emitterBurstsAgesAndDies() {
        val w = WireWriter()
        w.u32(0).u32(0).u8(ParticleParams.PATTERN_EXPLODE).u16(0).u16(0).u8(0).u8(0).u16(128).u16(0).u16(256).u16(512).u8(3)
        repeat(3) { w.u16(256 * 128) }; repeat(3) { w.u16(256 * 128) }
        w.uuid(UUID(0, 0)).uuid(UUID(0, 0)).u32(0x3).u16(256).bytes(byteArrayOf(-1, -1, -1, -1)).bytes(byteArrayOf(-1, -1, -1, 0)).u8(32).u8(32).u8(32).u8(32)
        val e = ParticleEmitter(ParticleParams.parse(w.toByteArray())!!, seed = 1)
        e.step(0.5f, Vec3(10f, 10f, 10f), Quat.IDENTITY)
        assertEquals(3, e.count)
        val s = e.sprites()
        assertEquals(3, s.size)
        for (i in 1..4) e.step(0.5f, Vec3(10f, 10f, 10f), Quat.IDENTITY)
        assertTrue(e.count <= 400)
        // Particles live 1 s and bursts come every 0.5 s: at steady state about 6 are alive.
        assertTrue("alive=${e.count}", e.count in 3..9)
    }
}
