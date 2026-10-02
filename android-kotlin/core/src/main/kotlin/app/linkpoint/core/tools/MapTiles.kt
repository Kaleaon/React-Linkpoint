package app.linkpoint.core.tools

/** Layout and labelling for the world map, following the official viewer's map floater. */
data class MapTile(val x: Int, val y: Int, val column: Int, val row: Int, val center: Boolean)

object MapTiles {
    /** The tiles of a (2r+1) square around a region, north at the top (row 0). */
    fun around(centerX: Int, centerY: Int, radius: Int): List<MapTile> {
        val tiles = ArrayList<MapTile>()
        for (row in 0..radius * 2) for (col in 0..radius * 2) {
            tiles += MapTile(centerX + col - radius, centerY + radius - row, col, row, col == radius && row == radius)
        }
        return tiles.filter { it.x >= 0 && it.y >= 0 }
    }

    /** SimAccess: 13 PG, 21 Mature, 42 Adult. */
    fun ratingName(access: Int?): String = when (access) { 13 -> "General"; 21 -> "Moderate"; 42 -> "Adult"; else -> "Unknown" }

    /** The tile server's image for a region of Second Life; other grids advertise no tiles. */
    fun tileUrl(x: Int, y: Int) = "https://map.secondlife.com/map-1-$x-$y-objects.jpg"

    const val WATER_COLOR = 0xFF1B3A5C.toInt()
}
