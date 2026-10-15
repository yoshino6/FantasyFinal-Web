# 装备场景向下扩绘

本图使用 imagegen 技能的内置 `image_gen__imagegen` 进行参考图编辑与扩绘。输入为既有 `main-scenes-v2/equipment-expanded.webp` 和权威中心场景 `growth-v1/equipment-scene.webp`。原输出复制为本目录 `equipment-courtyard-source.png`，1254×1254；运行时使用同尺寸 WebP `equipment-courtyard.webp`，仅做格式压缩，没有以 SVG/CSS 填补场景。

单张完整图包含石拱、旗帜、圆台与其下方连续石板庭院。运行时背景和立绘共用源图圆台中心坐标 `(619,552)`，整张图以单图缩放覆盖视口；不再使用第二张放大图填边。详情区域的显示与切换不会改变上部场景容器尺寸。

原始生成文件：`C:/Users/afshu/.codex/generated_images/01a1260b-fd64-7f12-ace6-a0827c96c041/exec-bf9d9e1b-2248-4722-85e0-c6f9b9a739e8.png`。

## 完整提示词

```text
Use case: precise-object-edit / outpainting.
Asset type: one complete raster background for the equipment page of a Chinese light-anime fantasy RPG.
Image 1 is the edit target: the current expanded equipment environment. Image 2 is the authoritative original central scene reference. Preserve the appearance, perspective, drawing style and palette of the original central stone arch, ivy and little white flowers, blue-and-gold hanging banners, distant castle, and the single round stone platform with its gold-and-blue compass rose. There must be only one platform and one central arch.
Requested change: extend and seamlessly repaint the surrounding scene, especially substantially downward, so the existing central platform can be moved up in the web layout and the area below it is fully illustrated continuous courtyard paving. Do not leave empty/white/transparent strips. Do not merely stretch the bottom row or tile an existing image. Remove any visible rectangular seam between the original central scene and the previous expansion, maintaining consistent brushwork and perspective throughout.
Composition: square canvas, high-resolution. Keep the round platform's compass-rose center at approximately horizontal 50%, vertical 42% of the complete canvas. Above it retain the familiar flower-covered arch and castle view. Below it, the lower half of the canvas shows gently sunlit old cream stone courtyard paving continuing toward the viewer, with perspective-correct joints and a few tiny leaf or petal details. White flowering bushes and low stone railings continue at the far left and right; the center foreground stays calm and readable behind live equipment-detail UI.
Important: preserve the central scene design from Image 2 as faithfully as possible, including its round platform, compass pattern, architecture, scale relationships and sunny colors; expand the environment, do not redesign it. Match the existing polished, warm, hand-painted anime game art. This is an environment-only background. No characters, no equipment icons, no UI panels, no text, no logo, no borders, no collage seams, no duplicate zoomed scene, no gradients or blank filler. Opaque background.
```
