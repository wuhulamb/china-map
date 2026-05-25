#!/usr/bin/env python3
"""
将 TopoJSON 转换为 Leaflet 可加载的 JS 数据文件。

用法：
    python3 generate_data.py                                    # china.topo.json → china_data.js
    python3 generate_data.py --input china.topo.json --output china_data.js
"""

import json
import argparse
import os


def convert(input_file, output_file, var_name):
    with open(input_file, 'r', encoding='utf-8') as f:
        data = json.load(f)

    json_str = json.dumps(data, ensure_ascii=False)

    with open(output_file, 'w', encoding='utf-8') as f:
        f.write(f'// 由 {os.path.basename(input_file)} 生成\n')
        f.write(f'var {var_name} = {json_str};\n')

    size_kb = os.path.getsize(output_file) / 1024
    print(f"生成 {output_file}: {size_kb:.1f} KB (TopoJSON 格式)")


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='将 TopoJSON 转换为 JS 数据文件')
    parser.add_argument('--input', default='china.topo.json', help='输入 TopoJSON 文件路径')
    parser.add_argument('--output', default='china_data.js', help='输出 JS 文件路径')
    parser.add_argument('--var', default='CHINA_CITIES', help='JavaScript 变量名')
    args = parser.parse_args()

    convert(args.input, args.output, args.var)