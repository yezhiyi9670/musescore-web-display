import os
import shutil
from sys import argv

if(len(argv) < 2):
	print('Usage: musescore-wd-export <score-file>')
	exit(3)

filename = argv[1]

if(filename[-5:] != '.mscz'):
	print('Score file must have .mscz extension.')
	exit(4)
	
if(os.path.isdir(filename) or not os.path.exists(filename)):
	print('Cannot find file ' + filename)
	exit(5)

dst_dir_name = filename + '.wd/'

if os.path.exists(dst_dir_name):
    if os.path.isfile(dst_dir_name):
        exit(1)
    # shutil.rmtree(dst_dir_name)

os.makedirs(dst_dir_name, exist_ok=True)

print("- Generating metadata")
os.system('musescore "%s" --export-to "%s"' % (filename, dst_dir_name + 'meta.metajson'))
print("- Generating SVG graphics")
os.system('musescore "%s" --export-to "%s"' % (filename, dst_dir_name + 'graphic.svg'))
print("- Generating OGG audio")
os.system('musescore "%s" --export-to "%s"' % (filename, dst_dir_name + 'audio.ogg'))
print("- Generating measure positions")
os.system('musescore "%s" --export-to "%s"' % (filename, dst_dir_name + 'measures.mpos'))
print("- Generating cursor positions")
os.system('musescore "%s" --export-to "%s"' % (filename, dst_dir_name + 'cursors.spos'))

