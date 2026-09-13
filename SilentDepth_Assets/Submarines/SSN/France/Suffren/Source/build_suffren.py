"""Build FR_SSN_Suffren (Batch A).

    blender --background --python Source/build_suffren.py [-- --gray]
"""
from pathlib import Path
import sys

SOURCE = Path(__file__).resolve().parent
sys.path.insert(0, str(SOURCE.parents[3] / 'Tools'))

import sd_batch_a_params as params          # noqa: E402
import sd_hull_pipeline as pipeline         # noqa: E402

if __name__ == '__main__':
    pipeline.run(params.suffren(str(SOURCE.parent)))
