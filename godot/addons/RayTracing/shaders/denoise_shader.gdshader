shader_type canvas_item;

void fragment() {
    vec4 color = texture(TEXTURE, UV);
    vec4 back = texture(SCREEN_TEXTURE, SCREEN_UV);

    COLOR = vec4(color.rgb, 1.0);
}