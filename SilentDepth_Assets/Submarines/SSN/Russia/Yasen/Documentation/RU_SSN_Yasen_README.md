# RU_SSN_Yasen / Project 885 独立重建

状态：VALIDATING。技术检查通过；外形参考核对与UE4.27实际导入均为NOT VERIFIED。

入口：Source/build_yasen_v2.py。几何：Source/yasen_geometry.py。
验证：Source/validate_yasen_v2.py。所有生成物从干净Blender进程生成。
主文件：Blend/RU_SSN_Yasen_MASTER.blend，含打包本地纹理、可编辑分件、隐藏LOD和碰撞集合。
导出：GLB/RU_SSN_Yasen.glb，FBX/下LOD0-3，Collision/下UCX碰撞体。
LOD0包含碰撞代理，其他LOD及GLB不包含碰撞代理。
UV0为材质贴图，UV1为独立打包光照图；贴图嵌入GLB及FBX。
本地原创网格与程序化贴图，供本项目商业使用；无外部运行时依赖。

重建解决：尖艏、分段起伏、悬空细条、错误外环、桨叶无几何桨距，以及回读比较分支未执行。
未声称工程精确、照片复原或引擎导入完成。
