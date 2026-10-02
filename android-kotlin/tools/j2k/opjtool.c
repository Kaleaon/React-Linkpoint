// Encode PNM -> J2K and decode J2K -> PNM with OpenJPEG, exposing the coding parameters.
#include <openjpeg.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

static void quiet(const char *m, void *d) { (void)m; (void)d; }

static unsigned char *read_pnm(const char *path, int *w, int *h, int *c) {
  FILE *f = fopen(path, "rb"); if (!f) { perror(path); exit(1); }
  char magic[3]; int maxv;
  if (fscanf(f, "%2s %d %d %d", magic, w, h, &maxv) != 4) exit(1);
  fgetc(f);
  *c = magic[1] == '6' ? 3 : 1;
  size_t n = (size_t)(*w) * (*h) * (*c);
  unsigned char *d = malloc(n);
  if (fread(d, 1, n, f) != n) exit(1);
  fclose(f);
  return d;
}

int main(int argc, char **argv) {
  if (argc < 4) { fprintf(stderr, "usage: enc in.pnm out.j2k [opts] | dec in.j2k out.pnm [reduce]\n"); return 1; }
  if (!strcmp(argv[1], "enc")) {
    int w, h, nc; unsigned char *px = read_pnm(argv[2], &w, &h, &nc);
    opj_cparameters_t p; opj_set_default_encoder_parameters(&p);
    p.cod_format = 0; p.numresolution = 6; p.tcp_mct = (nc == 3) ? 1 : 0;
    int layers = 1; float rates[16]; int nprec = 0;
    for (int i = 4; i < argc; i++) {
      if (!strcmp(argv[i], "-levels")) p.numresolution = atoi(argv[++i]) + 1;
      else if (!strcmp(argv[i], "-cblk")) { p.cblockw_init = atoi(argv[++i]); p.cblockh_init = atoi(argv[++i]); }
      else if (!strcmp(argv[i], "-prog")) { char *s = argv[++i]; p.prog_order = !strcmp(s,"LRCP")?OPJ_LRCP:!strcmp(s,"RLCP")?OPJ_RLCP:!strcmp(s,"RPCL")?OPJ_RPCL:!strcmp(s,"PCRL")?OPJ_PCRL:OPJ_CPRL; }
      else if (!strcmp(argv[i], "-irrev")) p.irreversible = 1;
      else if (!strcmp(argv[i], "-nomct")) p.tcp_mct = 0;
      else if (!strcmp(argv[i], "-tile")) { p.tile_size_on = 1; p.cp_tdx = atoi(argv[++i]); p.cp_tdy = atoi(argv[++i]); }
      else if (!strcmp(argv[i], "-modes")) p.mode = atoi(argv[++i]);
      else if (!strcmp(argv[i], "-sop")) p.csty |= 0x02;
      else if (!strcmp(argv[i], "-eph")) p.csty |= 0x04;
      else if (!strcmp(argv[i], "-prec")) { // list of pw,ph pairs lowest resolution first... OpenJPEG wants highest first
        p.csty |= 0x01; while (i + 1 < argc && argv[i+1][0] != '-') { sscanf(argv[++i], "%d,%d", &p.prcw_init[nprec], &p.prch_init[nprec]); nprec++; }
        p.res_spec = nprec; }
      else if (!strcmp(argv[i], "-layers")) { layers = atoi(argv[++i]); for (int k = 0; k < layers; k++) rates[k] = atof(argv[++i]); }
      else if (!strcmp(argv[i], "-offset")) { p.image_offset_x0 = atoi(argv[++i]); p.image_offset_y0 = atoi(argv[++i]); }
      else { fprintf(stderr, "unknown option %s\n", argv[i]); return 1; }
    }
    p.tcp_numlayers = layers; p.cp_disto_alloc = 1;
    for (int k = 0; k < layers; k++) p.tcp_rates[k] = rates[k];
    if (layers == 1 && rates[0] == 0) p.tcp_rates[0] = 0;
    opj_image_cmptparm_t cp[3]; memset(cp, 0, sizeof cp);
    for (int c = 0; c < nc; c++) { cp[c].prec = 8; cp[c].sgnd = 0; cp[c].dx = 1; cp[c].dy = 1; cp[c].w = w; cp[c].h = h; cp[c].x0 = 0; cp[c].y0 = 0; }
    opj_image_t *img = opj_image_create(nc, cp, nc == 3 ? OPJ_CLRSPC_SRGB : OPJ_CLRSPC_GRAY);
    img->x0 = p.image_offset_x0; img->y0 = p.image_offset_y0; img->x1 = img->x0 + w; img->y1 = img->y0 + h;
    for (int c = 0; c < nc; c++) { img->comps[c].x0 = 0; img->comps[c].y0 = 0; }
    for (int i = 0; i < w * h; i++) for (int c = 0; c < nc; c++) img->comps[c].data[i] = px[i * nc + c];
    opj_codec_t *codec = opj_create_compress(OPJ_CODEC_J2K);
    opj_set_info_handler(codec, quiet, 0); opj_set_warning_handler(codec, quiet, 0); opj_set_error_handler(codec, quiet, 0);
    if (!opj_setup_encoder(codec, &p, img)) { fprintf(stderr, "setup failed\n"); return 2; }
    opj_stream_t *st = opj_stream_create_default_file_stream(argv[3], OPJ_FALSE);
    if (!opj_start_compress(codec, img, st) || !opj_encode(codec, st) || !opj_end_compress(codec, st)) { fprintf(stderr, "encode failed\n"); return 3; }
    return 0;
  }
  // decode
  int reduce = argc > 4 ? atoi(argv[4]) : 0;
  opj_dparameters_t dp; opj_set_default_decoder_parameters(&dp); dp.cp_reduce = reduce;
  opj_codec_t *codec = opj_create_decompress(OPJ_CODEC_J2K);
  opj_set_info_handler(codec, quiet, 0); opj_set_warning_handler(codec, quiet, 0); opj_set_error_handler(codec, quiet, 0);
  opj_setup_decoder(codec, &dp);
  opj_stream_t *st = opj_stream_create_default_file_stream(argv[2], OPJ_TRUE);
  opj_image_t *img = NULL;
  if (!opj_read_header(st, codec, &img) || !opj_decode(codec, st, img) || !opj_end_decompress(codec, st)) { fprintf(stderr, "decode failed\n"); return 3; }
  int nc = img->numcomps, w = img->comps[0].w, h = img->comps[0].h;
  FILE *f = fopen(argv[3], "wb");
  fprintf(f, "P%d\n%d %d\n255\n", nc == 3 ? 6 : 5, w, h);
  for (int i = 0; i < w * h; i++) for (int c = 0; c < nc; c++) { int v = img->comps[c].data[i]; if (img->comps[c].prec != 8) v = v >> (img->comps[c].prec - 8); if (v < 0) v = 0; if (v > 255) v = 255; fputc(v, f); }
  fclose(f);
  return 0;
}
