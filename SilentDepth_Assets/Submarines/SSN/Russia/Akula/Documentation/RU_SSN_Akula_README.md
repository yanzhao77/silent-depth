# RU_SSN_Akula

状态：VALIDATING。

本版放弃旧艇体、围壳、舵面及螺旋桨几何，以用户第4张侧视和俯视线稿重新取样建模。仅复用既有FBX导出和LOD整理工具，不调用旧版造型函数。

运行入口：Source/build_akula_drawing.py。几何：Source/akula_drawing_geometry.py。Profile、Deck为正交视图；Tail_QA为推进器近景。参考图仅供本地审阅，不随游戏分发。

UE4.27实际导入：NOT VERIFIED。几何连接为有交叠的独立零件，并非单一布尔焊接体。
