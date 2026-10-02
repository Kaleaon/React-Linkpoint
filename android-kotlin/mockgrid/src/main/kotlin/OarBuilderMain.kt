import app.linkpoint.core.mock.FaceSpec
import app.linkpoint.core.mock.Wire
import java.io.ByteArrayOutputStream
import java.io.File
import java.nio.ByteBuffer
import java.util.Base64
import java.util.UUID
import java.util.zip.GZIPOutputStream

/**
 * Writes an OpenSim region archive (OAR) with test content: every basic prim shape, a hollow/twisted prim,
 * textured faces, a sculpt, an LLMesh, a linkset, floating text and a particle emitter. Load it into a running OpenSim
 * with:  load oar --merge /path/to/linkpoint-test.oar
 *
 *   ./gradlew :mockgrid:runOar --args="/tmp/linkpoint-test.oar"
 */
private fun id(n: Int) = UUID.fromString("a0a0a0a0-0000-4000-8000-%012d".format(n))
private val TEX_CHECKER = id(1); private val TEX_PLASMA = id(2); private val TEX_SCULPT = id(3)
private val MESH_PYRAMID = id(10)
private val OWNER = UUID.fromString("61f927f7-4cab-4d62-9bd3-37d7d6968dd8") // overwritten by --merge's default owner handling when absent

private class Tar {
    val out = ByteArrayOutputStream()
    fun add(name: String, data: ByteArray) {
        val h = ByteArray(512)
        fun put(off: Int, s: String) = s.toByteArray().copyInto(h, off)
        put(0, name); put(100, "0000644\u0000"); put(108, "0000000\u0000"); put(116, "0000000\u0000")
        put(124, "%011o\u0000".format(data.size)); put(136, "%011o\u0000".format(System.currentTimeMillis() / 1000)); put(156, "0")
        put(257, "ustar\u000000"); for (i in 148 until 156) h[i] = ' '.code.toByte()
        put(148, "%06o\u0000 ".format(h.sumOf { it.toInt() and 0xFF }))
        out.write(h); out.write(data); out.write(ByteArray((512 - data.size % 512) % 512))
    }
    fun finish(): ByteArray { out.write(ByteArray(1024)); return out.toByteArray() }
}

private class Prim(
    val name: String, val x: Float, val y: Float, val z: Float, val sx: Float = 1f, val sy: Float = 1f, val sz: Float = 1f,
    val profileCurve: Int = 1, val pathCurve: Int = 16, val hollow: Int = 0, val twist: Int = 0, val taper: Int = 0,
    val faces: ByteArray? = null, val sculpt: Pair<UUID, Int>? = null, val text: String = "", val particles: ByteArray? = null,
    val children: List<Prim> = emptyList(),
)

private fun b64(b: ByteArray) = Base64.getEncoder().encodeToString(b)
private fun guid(u: UUID) = "<Guid>$u</Guid>"
private fun vec(tag: String, x: Float, y: Float, z: Float) = "<$tag><X>$x</X><Y>$y</Y><Z>$z</Z></$tag>"

private fun part(p: Prim, rootPos: Triple<Float, Float, Float>, isRoot: Boolean, link: Int): String {
    val uuid = UUID.nameUUIDFromBytes(("prim-" + p.name).toByteArray())
    val shape = StringBuilder("<Shape>")
    shape.append("<ProfileCurve>${p.profileCurve}</ProfileCurve>")
    p.faces?.let { shape.append("<TextureEntry>${b64(it)}</TextureEntry>") }
    shape.append("<PathBegin>0</PathBegin><PathCurve>${p.pathCurve}</PathCurve><PathEnd>0</PathEnd><PathRadiusOffset>0</PathRadiusOffset>")
    shape.append("<PathRevolutions>0</PathRevolutions><PathScaleX>100</PathScaleX><PathScaleY>100</PathScaleY><PathShearX>0</PathShearX><PathShearY>0</PathShearY><PathSkew>0</PathSkew>")
    shape.append("<PathTaperX>${p.taper}</PathTaperX><PathTaperY>${p.taper}</PathTaperY><PathTwist>${p.twist}</PathTwist><PathTwistBegin>${-p.twist}</PathTwistBegin>")
    shape.append("<PCode>9</PCode><ProfileBegin>0</ProfileBegin><ProfileEnd>0</ProfileEnd><ProfileHollow>${p.hollow}</ProfileHollow><State>0</State>")
    shape.append("<ProfileShape>${when (p.profileCurve and 7) { 0 -> "Circle"; 1 -> "Square"; 2 -> "IsometricTriangle"; 3 -> "EquilateralTriangle"; 4 -> "RightTriangle"; else -> "HalfCircle" }}</ProfileShape><HollowShape>Same</HollowShape>")
    if (p.sculpt != null) {
        val (tex, type) = p.sculpt
        val data = ByteBuffer.allocate(17).put(java.nio.ByteBuffer.allocate(16).putLong(tex.mostSignificantBits).putLong(tex.leastSignificantBits).array()).put(type.toByte()).array()
        val extra = ByteBuffer.allocate(1 + 2 + 4 + 17).order(java.nio.ByteOrder.LITTLE_ENDIAN).put(1).putShort(0x30).putInt(17).put(data).array()
        shape.append("<SculptTexture>${guid(tex)}</SculptTexture><SculptType>$type</SculptType><ExtraParams>${b64(extra)}</ExtraParams>")
    } else shape.append("<SculptTexture><Guid>00000000-0000-0000-0000-000000000000</Guid></SculptTexture><SculptType>0</SculptType>")
    shape.append("</Shape>")
    val pos = if (isRoot) vec("OffsetPosition", rootPos.first, rootPos.second, rootPos.third) else vec("OffsetPosition", p.x, p.y, p.z)
    return buildString {
        append("<SceneObjectPart xmlns:xsi=\"http://www.w3.org/2001/XMLSchema-instance\" xmlns:xsd=\"http://www.w3.org/2001/XMLSchema\">")
        append("<AllowedDrop>false</AllowedDrop><CreatorID>${guid(OWNER)}</CreatorID><FolderID>${guid(uuid)}</FolderID><InventorySerial>0</InventorySerial><TaskInventory />")
        append("<UUID>${guid(uuid)}</UUID><LocalId>0</LocalId><Name>${p.name}</Name><Material>3</Material><PassTouches>false</PassTouches><RegionHandle>0</RegionHandle>")
        append("<ScriptAccessPin>0</ScriptAccessPin>")
        append(vec("GroupPosition", rootPos.first, rootPos.second, rootPos.third)); append(pos)
        append("<RotationOffset><X>0</X><Y>0</Y><Z>0</Z><W>1</W></RotationOffset>")
        append(vec("Velocity", 0f, 0f, 0f)); append(vec("AngularVelocity", 0f, 0f, 0f)); append(vec("Acceleration", 0f, 0f, 0f))
        append("<Description /><Color><R>0</R><G>0</G><B>0</B><A>0</A></Color><Text>${p.text}</Text><SitName /><TouchName />")
        append("<LinkNum>$link</LinkNum><ClickAction>0</ClickAction>")
        append(shape); append(vec("Scale", p.sx, p.sy, p.sz))
        append("<SitTargetOrientation><X>0</X><Y>0</Y><Z>0</Z><W>1</W></SitTargetOrientation>"); append(vec("SitTargetPosition", 0f, 0f, 0f))
        append("<SitTargetOrientationLL><X>0</X><Y>0</Y><Z>0</Z><W>1</W></SitTargetOrientationLL>"); append(vec("SitTargetPositionLL", 0f, 0f, 0f))
        append("<ParentID>0</ParentID><CreationDate>1700000000</CreationDate><Category>0</Category><SalePrice>0</SalePrice><ObjectSaleType>0</ObjectSaleType><OwnershipCost>0</OwnershipCost>")
        append("<GroupID>${guid(UUID(0, 0))}</GroupID><OwnerID>${guid(OWNER)}</OwnerID><LastOwnerID>${guid(OWNER)}</LastOwnerID>")
        append("<BaseMask>2147483647</BaseMask><OwnerMask>2147483647</OwnerMask><GroupMask>0</GroupMask><EveryoneMask>0</EveryoneMask><NextOwnerMask>2147483647</NextOwnerMask>")
        append("<Flags>None</Flags><CollisionSound>${guid(UUID(0, 0))}</CollisionSound><CollisionSoundVolume>0</CollisionSoundVolume>")
        p.particles?.let { append("<ParticleSystem>${b64(it)}</ParticleSystem>") }
        append("</SceneObjectPart>")
    }
}

private fun group(p: Prim): String {
    val root = Triple(p.x, p.y, p.z)
    return buildString {
        append("<SceneObjectGroup><RootPart>"); append(part(p, root, true, 0)); append("</RootPart>")
        if (p.children.isEmpty()) append("<OtherParts />") else {
            append("<OtherParts>"); p.children.forEachIndexed { i, c -> append("<Part>"); append(part(c, root, false, i + 2)); append("</Part>") }; append("</OtherParts>")
        }
        append("</SceneObjectGroup>")
    }
}

fun main(args: Array<String>) {
    val out = File(args.firstOrNull() ?: "linkpoint-test.oar")
    val checker = Wire.textureEntry(FaceSpec(TEX_CHECKER, repeatU = 2f, repeatV = 2f))
    val plasma = Wire.textureEntry(FaceSpec(TEX_PLASMA), mapOf(1 to FaceSpec(TEX_CHECKER), 2 to FaceSpec(color = floatArrayOf(1f, 0.2f, 0.2f, 1f))))
    val glow = Wire.textureEntry(FaceSpec(color = floatArrayOf(0.2f, 1f, 0.4f, 0.6f), fullbright = true, glow = 0.4f))
    val z = 30f; val cx = 128f; val cy = 128f
    val prims = listOf(
        Prim("Box", cx + 6, cy, z, 2f, 2f, 2f, faces = checker),
        Prim("Cylinder", cx + 6, cy + 4, z, 1.5f, 1.5f, 3f, profileCurve = 0, faces = plasma),
        Prim("Sphere", cx + 6, cy + 8, z, 2f, 2f, 2f, profileCurve = 5, pathCurve = 32, faces = checker),
        Prim("Torus", cx + 6, cy - 4, z, 3f, 3f, 1f, profileCurve = 0, pathCurve = 32, faces = plasma),
        Prim("Hollow twisted box", cx + 6, cy - 8, z, 2f, 2f, 4f, hollow = 50000, twist = 90, taper = 40, faces = plasma),
        Prim("Triangle prism", cx + 10, cy, z, 2f, 2f, 2f, profileCurve = 3, faces = checker),
        Prim("Glow cube (alpha)", cx + 10, cy + 4, z, 1.5f, 1.5f, 1.5f, faces = glow),
        Prim("Sculpt sphere", cx + 10, cy - 4, z, 3f, 3f, 3f, profileCurve = 0, sculpt = TEX_SCULPT to 1, faces = plasma),
        Prim("LLMesh pyramid", cx + 10, cy + 8, z, 3f, 3f, 3f, profileCurve = 0, sculpt = MESH_PYRAMID to 5, faces = checker),
        Prim("Rigged limb mesh", cx + 10, cy - 8, z, 1f, 1f, 3f, profileCurve = 0, sculpt = Wire.RIGGED_LIMB_ID to 5, faces = checker),
        Prim("Linkset root", cx + 14, cy, z, 2f, 2f, 1f, faces = checker, children = listOf(
            Prim("Linkset child A", 0f, 0f, 1.5f, 1f, 1f, 2f, profileCurve = 0, faces = plasma),
            Prim("Linkset child B", 1.5f, 0f, 0f, 1f, 1f, 1f, profileCurve = 5, pathCurve = 32, faces = glow))),
        Prim("Sign", cx + 14, cy + 6, z, 1f, 1f, 1f, text = "Linkpoint test", faces = checker),
        Prim("Particles", cx + 14, cy - 6, z, 0.5f, 0.5f, 0.5f, faces = glow, particles = Wire.particleBlock(textureId = TEX_PLASMA)),
    )
    val tar = Tar()
    tar.add("archive.xml", "<archive major_version=\"0\" minor_version=\"8\"><creation_info><datetime>1700000000</datetime><id>${UUID.randomUUID()}</id></creation_info><region_info><is_megaregion>false</is_megaregion></region_info></archive>".toByteArray())
    for (p in prims) {
        val uuid = UUID.nameUUIDFromBytes(("prim-" + p.name).toByteArray())
        tar.add("objects/${p.name.replace(' ', '_')}_${p.x.toInt()}-${p.y.toInt()}-${p.z.toInt()}__$uuid.xml", ("<?xml version=\"1.0\" encoding=\"utf-8\"?>" + group(p)).toByteArray())
    }
    fun res(n: String) = object {}.javaClass.getResourceAsStream("/mock/$n")!!.readBytes()
    tar.add("assets/${TEX_CHECKER}_texture.jp2", res("checker.j2k"))
    tar.add("assets/${TEX_PLASMA}_texture.jp2", res("tex_plasma.j2k"))
    tar.add("assets/${TEX_SCULPT}_texture.jp2", res("sculpt_sphere.j2k"))
    tar.add("assets/${MESH_PYRAMID}_mesh.llmesh", Wire.pyramidMesh())
    tar.add("assets/${Wire.RIGGED_LIMB_ID}_mesh.llmesh", Wire.riggedLimbMesh()) // skinned mesh: joints, bind matrices, weights
    out.outputStream().use { f -> GZIPOutputStream(f).use { it.write(tar.finish()) } }
    println("wrote ${out.absolutePath} (${out.length()} bytes, ${prims.size} objects)")
}
