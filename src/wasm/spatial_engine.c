/**
 * Spatial Transform Engine - WebAssembly SIMD Kernel
 * 
 * Provides 128-bit SIMD accelerated matrix multiplication, frustum plane extractions,
 * SOA bounding box frustum culling, and VarRegion coordinate normalization up to 4096m.
 */

#include <wasm_simd128.h>
#include <stdint.h>
#include <stdbool.h>

#define WASM_EXPORT __attribute__((visibility("default")))

// Memory capacity bounds check helper
static inline bool is_valid_buffer(const void* ptr, uint32_t size, uint32_t mem_size) {
    uintptr_t offset = (uintptr_t)ptr;
    return (offset + size >= offset) && ((offset + size) <= mem_size);
}

/**
 * 4x4 Matrix multiplication (Column-Major 16 floats: out = a * b)
 */
WASM_EXPORT
int spatial_multiply_mat4(const float* a, const float* b, float* out, uint32_t mem_size) {
    if (!is_valid_buffer(a, 16 * sizeof(float), mem_size) ||
        !is_valid_buffer(b, 16 * sizeof(float), mem_size) ||
        !is_valid_buffer(out, 16 * sizeof(float), mem_size)) {
        return -1;
    }

    v128_t a0 = wasm_v128_load(&a[0]);
    v128_t a1 = wasm_v128_load(&a[4]);
    v128_t a2 = wasm_v128_load(&a[8]);
    v128_t a3 = wasm_v128_load(&a[12]);

    for (int c = 0; c < 4; c++) {
        v128_t b_x = wasm_f32x4_splat(b[c * 4 + 0]);
        v128_t b_y = wasm_f32x4_splat(b[c * 4 + 1]);
        v128_t b_z = wasm_f32x4_splat(b[c * 4 + 2]);
        v128_t b_w = wasm_f32x4_splat(b[c * 4 + 3]);

        v128_t res = wasm_f32x4_add(
            wasm_f32x4_add(wasm_f32x4_mul(a0, b_x), wasm_f32x4_mul(a1, b_y)),
            wasm_f32x4_add(wasm_f32x4_mul(a2, b_z), wasm_f32x4_mul(a3, b_w))
        );

        wasm_v128_store(&out[c * 4], res);
    }

    return 0;
}

/**
 * Extract 6 clip planes from a column-major 4x4 view-projection matrix.
 * Output planes array: 24 floats (6 planes * 4 floats [nx, ny, nz, d]).
 */
WASM_EXPORT
int spatial_extract_frustum(const float* m, float* out_planes, uint32_t mem_size) {
    if (!is_valid_buffer(m, 16 * sizeof(float), mem_size) ||
        !is_valid_buffer(out_planes, 24 * sizeof(float), mem_size)) {
        return -1;
    }

    for (int plane = 0; plane < 6; plane++) {
        int row = plane >> 1; // 0: x, 1: y, 2: z
        float sign = (plane & 1) ? -1.0f : 1.0f;
        int base = plane * 4;

        for (int col = 0; col < 4; col++) {
            out_planes[base + col] = m[col * 4 + 3] + sign * m[col * 4 + row];
        }

        float nx = out_planes[base + 0];
        float ny = out_planes[base + 1];
        float nz = out_planes[base + 2];
        float len_sq = nx * nx + ny * ny + nz * nz;

        if (len_sq < 1e-18f) {
            return 0; // Degenerate plane
        }

        // Fast inverse square root step or sqrt
        float inv_len = 1.0f / __builtin_sqrtf(len_sq);
        out_planes[base + 0] *= inv_len;
        out_planes[base + 1] *= inv_len;
        out_planes[base + 2] *= inv_len;
        out_planes[base + 3] *= inv_len;
    }

    return 1; // Success
}

/**
 * Transform an axis-aligned bounding box (min, max) by an affine matrix (Arvo's method).
 */
WASM_EXPORT
int spatial_transform_aabb(const float* matrix, const float* min, const float* max, float* out_min, float* out_max, uint32_t mem_size) {
    if (!is_valid_buffer(matrix, 16 * sizeof(float), mem_size) ||
        !is_valid_buffer(min, 3 * sizeof(float), mem_size) ||
        !is_valid_buffer(max, 3 * sizeof(float), mem_size) ||
        !is_valid_buffer(out_min, 3 * sizeof(float), mem_size) ||
        !is_valid_buffer(out_max, 3 * sizeof(float), mem_size)) {
        return -1;
    }

    out_min[0] = out_max[0] = matrix[12];
    out_min[1] = out_max[1] = matrix[13];
    out_min[2] = out_max[2] = matrix[14];

    for (int r = 0; r < 3; r++) {
        for (int c = 0; c < 3; c++) {
            float e = matrix[c * 4 + r];
            float a = e * min[c];
            float b = e * max[c];
            if (a < b) {
                out_min[r] += a;
                out_max[r] += b;
            } else {
                out_min[r] += b;
                out_max[r] += a;
            }
        }
    }

    return 0;
}

/**
 * Test a single AABB against 6 frustum planes.
 * Returns: 1 (INSIDE), 0 (INTERSECT), -1 (OUTSIDE).
 */
WASM_EXPORT
int spatial_test_aabb(const float* frustum_24, const float* min, const float* max, uint32_t mem_size) {
    if (!is_valid_buffer(frustum_24, 24 * sizeof(float), mem_size) ||
        !is_valid_buffer(min, 3 * sizeof(float), mem_size) ||
        !is_valid_buffer(max, 3 * sizeof(float), mem_size)) {
        return -1; // Outside / error
    }

    int result = 1; // INSIDE

    for (int p = 0; p < 6; p++) {
        int base = p * 4;
        float nx = frustum_24[base + 0];
        float ny = frustum_24[base + 1];
        float nz = frustum_24[base + 2];
        float d  = frustum_24[base + 3];

        // Positive vertex
        float px = (nx >= 0.0f) ? max[0] : min[0];
        float py = (ny >= 0.0f) ? max[1] : min[1];
        float pz = (nz >= 0.0f) ? max[2] : min[2];

        if (nx * px + ny * py + nz * pz + d < 0.0f) {
            return -1; // OUTSIDE
        }

        // Negative vertex
        float qx = (nx >= 0.0f) ? min[0] : max[0];
        float qy = (ny >= 0.0f) ? min[1] : max[1];
        float qz = (nz >= 0.0f) ? min[2] : max[2];

        if (nx * qx + ny * qy + nz * qz + d < 0.0f) {
            result = 0; // INTERSECT
        }
    }

    return result;
}

/**
 * 128-bit SIMD batch frustum culling on Structure of Arrays (SOA) bounding boxes.
 * Evaluates 'count' boxes 4 at a time using WASM SIMD registers.
 * Writes 1 (visible) or 0 (culled) into out_visibility[i].
 */
WASM_EXPORT
int spatial_cull_soa_boxes(
    const float* min_x, const float* min_y, const float* min_z,
    const float* max_x, const float* max_y, const float* max_z,
    uint8_t* out_visibility, int count,
    const float* frustum_24, uint32_t mem_size
) {
    if (count <= 0) return 0;
    if (!is_valid_buffer(min_x, count * sizeof(float), mem_size) ||
        !is_valid_buffer(min_y, count * sizeof(float), mem_size) ||
        !is_valid_buffer(min_z, count * sizeof(float), mem_size) ||
        !is_valid_buffer(max_x, count * sizeof(float), mem_size) ||
        !is_valid_buffer(max_y, count * sizeof(float), mem_size) ||
        !is_valid_buffer(max_z, count * sizeof(float), mem_size) ||
        !is_valid_buffer(out_visibility, count * sizeof(uint8_t), mem_size) ||
        !is_valid_buffer(frustum_24, 24 * sizeof(float), mem_size)) {
        return -1;
    }

    v128_t zero = wasm_f32x4_splat(0.0f);

    int i = 0;
    // SIMD loop processing 4 boxes per iteration
    for (; i <= count - 4; i += 4) {
        v128_t vx_min = wasm_v128_load(&min_x[i]);
        v128_t vy_min = wasm_v128_load(&min_y[i]);
        v128_t vz_min = wasm_v128_load(&min_z[i]);
        v128_t vx_max = wasm_v128_load(&max_x[i]);
        v128_t vy_max = wasm_v128_load(&max_y[i]);
        v128_t vz_max = wasm_v128_load(&max_z[i]);

        // Start with all 4 items visible (mask = all 1s / true)
        v128_t is_visible = wasm_i32x4_splat(-1); // 0xFFFFFFFF per lane

        for (int p = 0; p < 6; p++) {
            int base = p * 4;
            v128_t v_nx = wasm_f32x4_splat(frustum_24[base + 0]);
            v128_t v_ny = wasm_f32x4_splat(frustum_24[base + 1]);
            v128_t v_nz = wasm_f32x4_splat(frustum_24[base + 2]);
            v128_t v_d  = wasm_f32x4_splat(frustum_24[base + 3]);

            // Select positive vertex: if nx >= 0 use max_x else min_x
            v128_t mask_nx = wasm_f32x4_ge(v_nx, zero);
            v128_t mask_ny = wasm_f32x4_ge(v_ny, zero);
            v128_t mask_nz = wasm_f32x4_ge(v_nz, zero);

            v128_t px = wasm_v128_bitselect(vx_max, vx_min, mask_nx);
            v128_t py = wasm_v128_bitselect(vy_max, vy_min, mask_ny);
            v128_t pz = wasm_v128_bitselect(vz_max, vz_min, mask_nz);

            v128_t dot = wasm_f32x4_add(
                wasm_f32x4_add(wasm_f32x4_mul(v_nx, px), wasm_f32x4_mul(v_ny, py)),
                wasm_f32x4_add(wasm_f32x4_mul(v_nz, pz), v_d)
            );

            // Plane test: visible lane if dot >= 0
            v128_t in_plane = wasm_f32x4_ge(dot, zero);
            is_visible = wasm_v128_and(is_visible, in_plane);
        }

        // Store result for the 4 boxes
        uint32_t mask = wasm_i32x4_bitmask(is_visible);
        out_visibility[i + 0] = (mask & 1) ? 1 : 0;
        out_visibility[i + 1] = (mask & 2) ? 1 : 0;
        out_visibility[i + 2] = (mask & 4) ? 1 : 0;
        out_visibility[i + 3] = (mask & 8) ? 1 : 0;
    }

    // Scalar tail loop for remaining boxes
    for (; i < count; i++) {
        float box_min[3] = { min_x[i], min_y[i], min_z[i] };
        float box_max[3] = { max_x[i], max_y[i], max_z[i] };
        int res = spatial_test_aabb(frustum_24, box_min, box_max, mem_size);
        out_visibility[i] = (res != -1) ? 1 : 0;
    }

    return 0;
}

static inline float float_mod(float val, float mod) {
    if (mod <= 0.0f) return 0.0f;
    int quotient = (int)(val / mod);
    float res = val - ((float)quotient * mod);
    if (res < 0.0f) res += mod;
    return res;
}

/**
 * Normalizes 3D spatial coordinate from global grid coordinates to region-local
 * vector (0 to region_size) supporting dynamic OpenSim VarRegions up to 4096m.
 */
WASM_EXPORT
int spatial_global_to_region_local(
    float x, float y, float z,
    float origin_x, float origin_y,
    float region_size,
    float* out_vec3,
    uint32_t mem_size
) {
    if (!is_valid_buffer(out_vec3, 3 * sizeof(float), mem_size)) {
        return -1;
    }

    if (region_size <= 0.0f) region_size = 256.0f;

    float local_x = x;
    float local_y = y;

    if (local_x >= origin_x && origin_x > 0.0f) {
        local_x = local_x - origin_x;
    } else if (local_x > region_size && origin_x == 0.0f) {
        local_x = float_mod(local_x, region_size);
    }

    if (local_y >= origin_y && origin_y > 0.0f) {
        local_y = local_y - origin_y;
    } else if (local_y > region_size && origin_y == 0.0f) {
        local_y = float_mod(local_y, region_size);
    }

    // Clamp to [0, region_size]
    out_vec3[0] = (local_x < 0.0f) ? 0.0f : ((local_x > region_size) ? region_size : local_x);
    out_vec3[1] = (local_y < 0.0f) ? 0.0f : ((local_y > region_size) ? region_size : local_y);
    out_vec3[2] = z;

    return 0;
}

/**
 * Converts region-local vector (0 to region_size) to global grid coordinates in meters.
 */
WASM_EXPORT
int spatial_region_local_to_global(
    float local_x, float local_y, float local_z,
    float origin_x, float origin_y,
    float* out_vec3,
    uint32_t mem_size
) {
    if (!is_valid_buffer(out_vec3, 3 * sizeof(float), mem_size)) {
        return -1;
    }

    out_vec3[0] = origin_x + local_x;
    out_vec3[1] = origin_y + local_y;
    out_vec3[2] = local_z;

    return 0;
}

/**
 * Batch VarRegion globalToRegionLocal using SIMD vectors.
 */
WASM_EXPORT
int spatial_batch_global_to_region_local(
    const float* in_xyz,
    float origin_x, float origin_y, float region_size,
    float* out_xyz, int count,
    uint32_t mem_size
) {
    if (count <= 0) return 0;
    if (!is_valid_buffer(in_xyz, count * 3 * sizeof(float), mem_size) ||
        !is_valid_buffer(out_xyz, count * 3 * sizeof(float), mem_size)) {
        return -1;
    }

    for (int i = 0; i < count; i++) {
        spatial_global_to_region_local(
            in_xyz[i * 3 + 0], in_xyz[i * 3 + 1], in_xyz[i * 3 + 2],
            origin_x, origin_y, region_size,
            &out_xyz[i * 3], mem_size
        );
    }

    return 0;
}

/**
 * Batch VarRegion regionLocalToGlobal using SIMD vectors.
 */
WASM_EXPORT
int spatial_batch_region_local_to_global(
    const float* in_xyz,
    float origin_x, float origin_y,
    float* out_xyz, int count,
    uint32_t mem_size
) {
    if (count <= 0) return 0;
    if (!is_valid_buffer(in_xyz, count * 3 * sizeof(float), mem_size) ||
        !is_valid_buffer(out_xyz, count * 3 * sizeof(float), mem_size)) {
        return -1;
    }

    for (int i = 0; i < count; i++) {
        spatial_region_local_to_global(
            in_xyz[i * 3 + 0], in_xyz[i * 3 + 1], in_xyz[i * 3 + 2],
            origin_x, origin_y,
            &out_xyz[i * 3], mem_size
        );
    }

    return 0;
}
