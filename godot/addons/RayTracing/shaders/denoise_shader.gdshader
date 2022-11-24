shader_type canvas_item;

void fragment() {
    vec4 color = texture(TEXTURE, UV);
    vec4 back = texture(SCREEN_TEXTURE, SCREEN_UV);
    vec3 col = mix(color.rgb, back.rgb, 0.0f);
    
    ivec2 crd = ivec2(FRAGCOORD.xy);    
    ivec2 texsize = textureSize(TEXTURE, 0);
    vec4 c = texelFetch(TEXTURE, crd, 0); 
    vec4 acc = c;
    float count = 1.0;
    float ra = c.a;
    int size = texsize.y/12;
    for (int yoff = -1; yoff > (-size-1); yoff--) {
        // Weight far away source pixels less
        float weight = 1.0-abs(float(yoff))/float(size);
        
		// Reflect at edge        
        ivec2 ycrd = crd+ivec2(0,yoff);
        //if (ycrd.y<0) ycrd = ivec2(crd.x, yoff-crd.y);
        
        vec4 oth = texelFetch(TEXTURE, ycrd, 0);
        float ddist = abs(oth.a-ra);
        if (ddist<0.5) {
            acc.rgb += oth.rgb*weight; 
            count += weight; 
            ra = oth.a; 
        }
    }
    ra = c.a;
    for (int yoff = 1; yoff < (size+1); yoff++) {
        // Weight far away source pixels less
        float weight = 1.0-abs(float(yoff))/float(size);
        
		// Reflect at edge        
        ivec2 ycrd = crd+ivec2(0,yoff);
        //if (ycrd.y>=texsize.y) ycrd = ivec2(crd.x, texsize.y-ycrd.y);
        
        vec4 oth = texelFetch(TEXTURE, ycrd, 0);
        float ddist = abs(oth.a-ra);
        if (ddist<0.5) {
            acc.rgb += oth.rgb*weight; 
            count += weight; 
            ra = oth.a;
        }
    }
    
    // Is this an edge that needs some anti-aliasing?
    if (count<=1.0) {
        acc.rgb += 0.25*texelFetch(TEXTURE, crd+ivec2(0,-2),0).rgb;
        acc.rgb += 0.5*texelFetch(TEXTURE, crd+ivec2(0,-1),0).rgb;
        acc.rgb += 0.5*texelFetch(TEXTURE, crd+ivec2(0,1),0).rgb;
        acc.rgb += 0.25*texelFetch(TEXTURE, crd+ivec2(0,2),0).rgb;
        count += 1.5;
    }
    vec4 fragColor;
    fragColor = acc * (1.0/count);
    fragColor.a = c.a;
    
    COLOR = fragColor;
}