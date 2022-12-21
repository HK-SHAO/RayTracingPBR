// Modified by HK-SHAO - 2022

// Created by genis sole - 2016
// License Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International.
#include "common.glsl"
#iKeyboard

#iChannel0 "self"

#define store(P, V) if (all(equal(ivec2(fragCoord), P))) fragColor = V
#define load(P) texelFetch(iChannel0, ivec2(P), 0)

#define key(k) float(isKeyDown(k))

const int Key_Space    = 32;

vec3 KeyboardInput() {
	vec3 i = vec3(key(Key_D) - key(Key_A), 
                  key(Key_E) - key(Key_Q),
                  key(Key_S) - key(Key_W));
    
    float n = abs(abs(i.x) - abs(i.y));
    return i * (n + (1.0 - n)*inversesqrt(2.0));
}

vec3 CameraDirInput(vec2 vm) {
    vec2 m = vm / iResolution.x;
    return CameraRotation(m) * KeyboardInput();
}

void mainImage(out vec4 fragColor, in vec2 fragCoord) {   
    if (any(greaterThan(ivec2(fragCoord), MEMORY_BOUNDARY))) return;
    
    fragColor = load(fragCoord);
    
    if (iFrame == 0) {
        store(POSITION, vec4(0.0, 0.0, 4.0, 0.0));
        store(TARGET,   vec4(0.0, -0.2, 4.0, 0.0));
        store(VMOUSE,   vec4(0.0, 10.0, 0.0, 0.0));
        store(TMOUSE,   vec4(0.0));
        store(PMOUSE,   vec4(0.0));
        
        return;
    }

    vec3 target      = load(TARGET).xyz;   
    vec3 position    = load(POSITION).xyz;
    vec2 pm          = load(PMOUSE).xy;
    vec2 vm          = load(VMOUSE).xy;
    vec3 tm          = load(TMOUSE).xyz;
    
    vec2 resolution  = load(RESOLUTION).xy;
    
    if (iTimeDelta > 0.1) return;
    
    vm       += (tm.xy - vm) * iTimeDelta * 20.0;
    target   += CameraDirInput(vm.xy) * iTimeDelta * 5.0;
    position += (target - position) * iTimeDelta * 5.0;
    
    store(TARGET,   vec4(target, 0.0));
    store(POSITION, vec4(position, 0.0));
    store(VMOUSE,   vec4(vm, 0.0, 0.0));
    
    store(RESOLUTION, vec4(iResolution.xy, 0.0, 0.0));
    store(SPACE, vec4(key(Key_Space)));
    store(MOVING, vec4(length(tm.xy - vm),
                       length(target - position),
                       float(any(notEqual(resolution, iResolution.xy))), 0.0));
    
	if (iMouse.z > 0.0) {
        store(TMOUSE, vec4(pm + (abs(iMouse.zw) - iMouse.xy), 1.0, 0.0));
	} else if (tm.z != 0.0) {
        store(PMOUSE, vec4(tm.xy, 0.0, 0.0));
    }

}