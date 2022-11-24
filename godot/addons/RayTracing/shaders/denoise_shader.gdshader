shader_type canvas_item;

const float threshold = 0.1f;

float avg(vec3 c) {
    return (c.r + c.g + c.b) / 3.0;
}

void fragment() {
    vec4 color = texture(TEXTURE, UV);
    vec4 back = texture(SCREEN_TEXTURE, SCREEN_UV);
    vec3 col = mix(color.rgb, back.rgb, 0.2f);
    if(avg(color.rgb) < threshold) {
        vec3 sur[4];
        float pixelMove = 1.f;
        float e = pixelMove * SCREEN_PIXEL_SIZE.x;
        float e2 = pixelMove * SCREEN_PIXEL_SIZE.y;
        sur[0] = texture(SCREEN_TEXTURE, SCREEN_UV + vec2(e,0.f)).rgb;
        sur[1] = texture(SCREEN_TEXTURE, SCREEN_UV + vec2(-e,0.f)).rgb;
        sur[2] = texture(SCREEN_TEXTURE, SCREEN_UV + vec2(0.f,e2)).rgb;
        sur[3] = texture(SCREEN_TEXTURE, SCREEN_UV + vec2(0.f,-e2)).rgb;
        vec3 sum = vec3(0.f);
        float counter=0.f;
        for(int i = 0;i < 4; i++){
            if(avg(sur[i]) > threshold){
                sum+=sur[i];
                counter++;
            }
        }
        
        sum/=counter;
        col = sum;
    }
    
    COLOR = vec4(col, 1.);
}