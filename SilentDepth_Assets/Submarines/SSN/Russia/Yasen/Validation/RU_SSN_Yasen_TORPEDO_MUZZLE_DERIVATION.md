# RU_SSN_Yasen Torpedo Muzzle Derivation

- 状态：GAMEPLAY_DERIVED_FROM_MASTER_GEOMETRY
- 真实测量声明：NOT REAL-WORLD MEASUREMENT
- dry-run：false
- MASTER 相对路径：SilentDepth_Assets/Submarines/SSN/Russia/Yasen/Blend/RU_SSN_Yasen_MASTER.blend
- MASTER SHA-256：af4125271fef60c46cd3500a4a9178d3d8e48be6bb7a903104cc5e349c2e79ca
- MASTER 只读：PASS
- 候选 BowDoor：SUB_Yasen_BowDoor_-1_0, SUB_Yasen_BowDoor_-1_1, SUB_Yasen_BowDoor_-1_2, SUB_Yasen_BowDoor_1_0, SUB_Yasen_BowDoor_1_1, SUB_Yasen_BowDoor_1_2
- 最终对象：SUB_Yasen_BowDoor_1_2
- muzzle translation：[38.599311829,-6.763348579,1.751911044]
- launch direction：[0.786318362,-0.617821515,0]
- score：2.424222878
- clearance envelope：radius 0.35m, length 7m
- raycast hit：false
- sweep hit：false
- minimum sweep clearance：0.508504152

## 旧 SOCKET_TORPEDO_01 拒绝原因

- 旧位置位于 y=0 中线
- 旧位置高于当前 Hull 本体顶部
- 旧位置与当前 BowDoor evaluated geometry 没有充分对应关系
- 旧位置不得作为正式 gameplay muzzle transform
