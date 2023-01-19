import sys

if any('-ibl' in arg for arg in sys.argv):
    from src.ibl  import *
else:
    from src.main import *