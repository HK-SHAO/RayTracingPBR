#iChannel0 "pathtrace.glsl"

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec2 uv = fragCoord / iResolution.xy;
    vec4 color = texture(iChannel0, uv);
    fragColor = vec4(color.rgb/color.a, 1.0);
}