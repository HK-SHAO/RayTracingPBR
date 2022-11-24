shader_type canvas_item;

vec4 smartDeNoise(sampler2D tex, vec2 uv, float radius, float threshold) {
    float radQ = radius * radius;

    vec4 centrPx = texture(tex,uv);
    
    float zBuff = 0.0;
    vec4 aBuff = vec4(0.0);
    vec2 size = vec2(textureSize(tex, 0));
    
    for(float x=-radius; x <= radius; x++) {
        float pt = sqrt(radQ-x*x);
        for(float y=-pt; y <= pt; y++) {
            vec2 d = vec2(x,y);

            vec4 walkPx =  texture(tex,uv+d/size);

            vec4 dC = walkPx-centrPx;
            float deltaFactor = exp( -dot(dC, dC) * threshold);
                                 
            zBuff += deltaFactor;
            aBuff += deltaFactor*walkPx;
        }
    }
    return aBuff/zBuff;
}

void fragment() {
    vec4 color = texture(TEXTURE, UV);
    vec4 back = texture(SCREEN_TEXTURE, SCREEN_UV);
    vec3 col = mix(color.rgb, back.rgb, 0.2f);
    col = smartDeNoise(TEXTURE, UV, 10.0, 1.0).rgb;
    
    COLOR = vec4(col, 1.);
}