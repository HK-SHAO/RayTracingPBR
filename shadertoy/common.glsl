// Copyright © 2019-2022 HK-SHAO
// MIT Licensed: https://shao.fun/blog/w/taichi-ray-tracing.html

// 数学常量
const float NONE = 0.0;
const float PI   = 3.1415926535897932384626;
const float TAU  = 2.0 * PI;

// Free Camera
const ivec2 MEMORY_BOUNDARY = ivec2(4, 3);

const ivec2 POSITION = ivec2(0, 0);
const ivec2 MOVING = ivec2(0, 1);

const ivec2 VMOUSE = ivec2(1, 0);
const ivec2 PMOUSE = ivec2(1, 1);

const ivec2 TARGET = ivec2(2, 0);
const ivec2 TMOUSE = ivec2(2, 1);

const ivec2 RESOLUTION = ivec2(3, 0);
const ivec2 SPACE = ivec2(3, 1);

mat3 CameraRotation(vec2 m) {
    m.y = clamp(-m.y, -PI*0.5+0.01, PI*0.5-0.01);
    vec2 s = sin(m), c = cos(m);
    
    mat3 rotX = mat3(1.0, 0.0, 0.0, 0.0, c.y, s.y, 0.0, -s.y, c.y);
    mat3 rotY = mat3(c.x, 0.0, -s.x, 0.0, 1.0, 0.0, s.x, 0.0, c.x);
    
    return rotY * rotX;
}