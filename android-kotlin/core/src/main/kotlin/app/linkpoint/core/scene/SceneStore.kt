package app.linkpoint.core.scene

import app.linkpoint.core.net.Received
import java.util.concurrent.ConcurrentHashMap

/**
 * The objects of the current region as the simulator described them. Pure state: it neither
 * draws nor talks to the network. [version] changes whenever the set or any object changes.
 */
class SceneStore {
    private val objects = ConcurrentHashMap<Long, SimObject>()
    @Volatile var version: Long = 0; private set

    val size: Int get() = objects.size
    fun get(localId: Long): SimObject? = objects[localId]
    fun snapshot(): List<SimObject> = objects.values.toList()
    /** Objects that currently have a sound, without copying the whole scene (called several times a second). */
    fun withSound(): List<SimObject> = objects.values.filter { it.sound != null }
    /** The object with this full id (e.g. our own avatar), without copying the whole scene. */
    fun findByFullId(id: java.util.UUID): SimObject? = objects.values.firstOrNull { it.fullId == id }

    fun clear() { objects.clear(); version++ }

    /** Apply a raw simulator message. Returns local ids the viewer should request in full. */
    fun process(rx: Received): List<Long> {
        if (rx.id !in ObjectDecoder.MESSAGE_IDS) return emptyList()
        val need = ArrayList<Long>()
        for (c in ObjectDecoder.decode(rx.id, rx.body)) {
            when (c) {
                is ObjectChange.Full -> objects[c.obj.localId] = c.obj
                is ObjectChange.Motion -> objects.computeIfPresent(c.localId) { _, o ->
                    o.copy(position = c.position, rotation = c.rotation, textures = c.textures ?: o.textures)
                } ?: need.add(c.localId) // motion for an object we never heard of: ask for it
                is ObjectChange.Killed -> objects.remove(c.localId)
                is ObjectChange.NeedsFull -> need.addAll(c.localIds.filter { !objects.containsKey(it) })
            }
        }
        version++
        return need
    }

    /** Region-space position and rotation of an object, composing a linkset's parents. Null if a parent is unknown. */
    fun worldTransform(o: SimObject): Pair<Vec3, Quat>? {
        var pos = o.position
        var rot = o.rotation
        var cur = o
        var depth = 0
        while (cur.parentId != 0L) {
            val p = objects[cur.parentId] ?: return null
            pos = p.position + p.rotation.rotate(pos)
            rot = p.rotation * rot
            cur = p
            if (++depth > 8) return null
        }
        return pos to rot
    }

    /** The root of the linkset an object belongs to (itself if unlinked), or null if the chain is broken. */
    fun root(o: SimObject): SimObject? {
        var cur = o
        var depth = 0
        while (cur.parentId != 0L) { cur = objects[cur.parentId] ?: return null; if (++depth > 8) return null }
        return cur
    }
}
