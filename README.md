![](./docs/Screenshots/p2.png)
<div align=center>渲染100万面镜子</div>

---

# Ray Tracing PBR(WIP)

<div align=center><img src="./icon.png" width=100></img></div>

- 团队名：追光小队
- 项目名：用 Taichi 优化的基于 PBR 和 SDF 的实时光线追踪渲染器和可交互应用

```
[Taichi] version 1.3.0, llvm 10.0.0, commit bc087737, win, python 3.10.6
```

- Live Demo: https://shao.fun/RayTracingPBR/
- ShaderToy: https://www.shadertoy.com/view/ddSSWy
- Godot: https://github.com/HK-SHAO/Godot-RayTracing-Demo

## 简介

实际上光线追踪是一个很传统的研究，但高品质实时光线追踪仍然是渲染领域的老大难问题，高品质高性能的光照模型和光线追踪与降噪是值得研究的问题。

这次 [taichi hackathon](https://forum.taichi-lang.cn/t/topic/3647/) 我们实现了一种简洁高效的 PBR 光照模型，还研究了 Intel 最新的一篇光追降噪论文，而且它看起确实还不错 :)

此外，我们尝试将 taichi 与 Godot 游戏引擎结合，并成功的将我们的代码移植到了 Godot 中并顺利的跑了起来，而且为它做了一个可交互的 GUI 与用户操作逻辑。

## 这**四天**我们做了什么？

1. **从第零行代码开始，实现了基于 PBR 和 SDF 地图的实时光线追踪渲染器**
   - 这个渲染程序支持纹理映射，类似 Blender 的原理化 BSDF ，可以赋予反照率、粗糙度、金属度、透明度、折射率、法线贴图并渲染物体，并且支持自发光物体和光源
   - 支持体积物体（体积云、体积雾），支持高度场
   - 在语法上，尽可能的简介优雅的写代码，并优化程序效率
   - 这个渲染程序支持 BTDF ，可以渲染出神奇的透射和折射现象
   - 这个渲染程序使用了 Godot 引擎的 GUI ，可以自由平滑的调整 `max samples`, `gamma`, `focus`, `aperture`, `exposure`, `camera speed`, `camera fov`, `light quality`, `resolution scaling` 等参数
   - 平滑自然的移动摄像机，以及自由的调整焦距和光圈等属性
   - 做了 ACES Fitted 色调映射算法
   - 上传了 bilibili 视频：[Taichi: 从零开始的光线追踪](https://www.bilibili.com/video/BV17v4y1o7GA/)
2. **写了一篇 4W+ 字的、用 taichi 实现 PBR 光追的科普文章**
   - https://shao.fun/blog/w/taichi-ray-tracing.html
   - https://forum.taichi-lang.cn/t/topic/3665/
   - 从零一步一步完成所有代码，代码包含大量注释
   - 制作了若干原创图讲解原理
3. **为 Taichi Language Cheatsheet 做了一个在线 SVG 版本**
   - https://github.com/HK-SHAO/taichi-cheatsheet-svg
   - https://shao.fun/taichi-cheatsheet-svg/
   - 并为 Taichi Language Cheatsheet 原仓库提交了两个 pr
4. **尝试将 Godot 游戏引擎与 taichi 结合，实现在线可交互的光线追踪应用**
   - 探索 GDNative C++ 与 taichi 的结合
   - 在 Godot 中开发了一个插件 (addon) 用于演示我们的 demo
   - 成功将代码编译为 WebAssembly ，可以在浏览器中运行
   - 在线 demo: https://raytracing.shao.fun/
5. **用 taichi 研究 Intel 一篇比较新和前沿的论文** [Temporally Stable Real-Time Joint Neural Denoising and Supersampling](https://www.intel.com/content/www/us/en/developer/articles/technical/temporally-stable-denoising-and-supersampling.html)，为满足实时光追，花了很多时间研究 1spp 下的光追降噪
   - 我们尽最大努力实现了这个降噪的一部分 taichi 代码

## 我们的不足之处
1. 野心实在是太大了，但能力不够，比如还想做一个互动小游戏，但事实因被 bug 消耗过多时间，仍然有部分功能没时间实现或优化的更好，只好放弃
2. 为 taichi 写的科普文章写的比较赶，文末可能比较乱，有的地方暂时没有写的很具体，bug 都还没 de 完呢
3. 对 GDNative C++ 仍然还没有完全熟悉，如何将 taichi 与 Godot 引擎结合的更好，还需要大量工作，这几天并没有更好的实现，仍然有扩展空间（例如 SDF 场景编辑器）
4. SDF 函数的非欧几里得空间变换与高效求交仍然是个未解之谜（文章中提到），因此做出了妥协，用另一种次为优雅的方法实现了相似的效果
5. 没有进一步优化求交阶段的效率，例如使用 BVH 和其它更高的数据结构和算法，程序效率仍然有可优化空间
6. 复现 Intel 的那篇光追降噪论文难度太大，我们尽了最大努力只实现了一部分代码，不过仍然有所收获

## 项目展望与改进空间
1. 对改进 SDF 函数的求交算法，可以采用 taichi 的自动微分系统，并改进数据结构 (BVH) 减少 SDF 函数计算次数，进一步提高渲染效率
2. 作为 taichi 与 Godot Engine 双厨，很清楚两者各自的优点，GDNative C++ 和 Godot 插件是可以为 taichi 实现一个更好的用户界面，甚至真正将 taichi 应用在先进图形技术的游戏开发之中
3. 更好的表达设计 SDF 函数构成的地图的数据结构，并且用 Godot 做一个更好的 SDF 场景编辑器
4. Temporally Stable Real-Time Joint Neural Denoising and Supersampling 是一篇很好的论文，希望能够进一步完全复现，这对高品质实时光追很重要

## 部分展示图

![](./docs/Screenshots/Godot%20Screenshot%202022.12.01%20-%2016.45.28.31.png)
<div align=center>经典的球</div>

---

![](./docs/Screenshots/Godot%20Screenshot%202022.12.01%20-%2022.30.44.63.png)
<div align=center>纹理映射</div>

---

![](./docs/Screenshots/Godot%20Screenshot%202022.12.02%20-%2016.56.57.76.png)
<div align=center>金属物体</div>

---

![](./docs/Screenshots/Godot%20Screenshot%202022.12.01%20-%2022.42.38.51.png)
<div align=center>纹理映射和应用法线贴图</div>

---

![](./docs/Screenshots/Godot%20Screenshot%202022.12.02%20-%2018.26.30.90.png)
<div align=center>各种奇奇怪怪的 SDF 形状</div>

---

![](./docs/Screenshots/p1.png)
<div align=center>自发光物体与透明体积物体</div>

---

![](./docs/Screenshots/p3.png)
<div align=center>物体放在玻璃立方体内部</div>

---

![](./docs/Screenshots/p4.png)
<div align=center>玻璃立方体内部出现的全反射</div>

---

![](./docs/Screenshots/p5.png)
<div align=center>镜中镜</div>
