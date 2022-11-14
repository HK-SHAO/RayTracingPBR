shader_type canvas_item;

uniform float frame = 1.0;

void fragment() {
	vec4 color = texture(TEXTURE, UV);
	vec4 back = texture(SCREEN_TEXTURE, SCREEN_UV);
	
	COLOR = mix(back, color, 1.0 / frame);
}
