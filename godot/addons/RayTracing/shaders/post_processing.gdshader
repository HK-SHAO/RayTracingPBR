shader_type canvas_item;

uniform float frame = 1.0;

void fragment() {
    vec4 color = texture(TEXTURE, UV);
    vec4 back = texture(SCREEN_TEXTURE, SCREEN_UV);
    
//    float lod = 2.0;
//    vec4 bloom = textureLod(SCREEN_TEXTURE, SCREEN_UV, lod);
//    color += clamp(2.5*bloom - 1.0, 0.0, 1.0);

    // 混合历史的帧来降噪
    color = mix(back, color, 1.0 / max(1.0, frame));

    COLOR = color;
}