"""Build US_SSN_Virginia (Batch A) with the shared hull pipeline.

    blender --background --python Source/build_virginia.py [-- --gray]

Parameters live in SilentDepth_Assets/Submarines/Tools/sd_batch_a_params.py and
trace back to this hull's REFERENCE.md.
"""
from pathlib import Path
import sys

SOURCE = Path(__file__).resolve().parent
sys.path.insert(0, str(SOURCE.parents[3] / 'Tools'))

import sd_batch_a_params as params          # noqa: E402
import sd_hull_pipeline as pipeline         # noqa: E402

if __name__ == '__main__':
    pipeline.run(params.virginia(str(SOURCE.parent)))
