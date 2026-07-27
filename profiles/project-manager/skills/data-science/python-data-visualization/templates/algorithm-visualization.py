#!/usr/bin/env python3
"""
Algorithm Visualization Template
===================================
Template for visualizing sorting algorithms and other array-based algorithms
in headless environments. Uses matplotlib with Agg backend.

Usage:
    python algorithm-visualization.py

Output:
    - /tmp/algorithm_steps.png (static chart with all steps)
    - /tmp/algorithm_animation.gif (animated GIF)
"""

import matplotlib
matplotlib.use('Agg')  # MUST be before importing pyplot
import matplotlib.pyplot as plt
import numpy as np
from typing import List, Dict, Optional
import copy

# ============================================================
# CONFIGURATION
# ============================================================

OUTPUT_DIR = '/tmp'
DPI = 150
FIGURE_SIZE = (14, 10)

# Color scheme (accessible, colorblind-friendly)
COLORS = {
    'initial': '#3498db',    # Blue
    'divide': '#e74c3c',     # Red
    'merge': '#2ecc71',      # Green
    'highlight': '#f39c12',  # Orange
    'final': '#1abc9c',      # Teal
    'compare': '#9b59b6',    # Purple
}

# ASCII labels (no emoji for headless compatibility)
LABELS = {
    'initial': '[Initial]',
    'divide': '[Divide]',
    'merge': '[Merge]',
    'highlight': '[Active]',
    'final': '[Done]',
}

# ============================================================
# STEP RECORDING
# ============================================================

class AlgorithmViz:
    """Records algorithm steps for visualization."""
    
    def __init__(self, algorithm_name: str):
        self.algorithm_name = algorithm_name
        self.steps: List[Dict] = []
        self.original_array: List = []
    
    def record_initial(self, arr: List):
        """Record initial state."""
        self.original_array = arr.copy()
        self.steps.append({
            'phase': 'initial',
            'description': f'Initial array: {arr}',
            'array': arr.copy(),
            'highlights': [],
            'depth': 0,
        })
    
    def record_divide(self, left: List, right: List, depth: int, description: str = ''):
        """Record a divide step."""
        self.steps.append({
            'phase': 'divide',
            'description': description or f'Divide: {left} | {right}',
            'arrays': [left.copy(), right.copy()],
            'highlights': [],
            'depth': depth,
        })
    
    def record_merge(self, merged: List, depth: int, description: str = ''):
        """Record a merge step."""
        self.steps.append({
            'phase': 'merge',
            'description': description or f'Merge: {merged}',
            'array': merged.copy(),
            'highlights': list(range(len(merged))),
            'depth': depth,
        })
    
    def record_final(self, arr: List):
        """Record final state."""
        self.steps.append({
            'phase': 'final',
            'description': f'Sorted: {arr}',
            'array': arr.copy(),
            'highlights': list(range(len(arr))),
            'depth': 0,
        })
    
    def visualize(self, output_path: Optional[str] = None) -> str:
        """Generate static visualization of all steps."""
        if not output_path:
            output_path = f'{OUTPUT_DIR}/{self.algorithm_name.lower()}_steps.png'
        
        # Select key steps (avoid too many)
        key_steps = self._select_key_steps()
        n_steps = len(key_steps)
        
        n_cols = 2
        n_rows = (n_steps + n_cols - 1) // n_cols
        
        fig, axes = plt.subplots(n_rows, n_cols, figsize=(FIGURE_SIZE[0], FIGURE_SIZE[1] * n_rows / 2))
        if n_rows == 1:
            axes = [axes] if n_cols == 1 else axes.flatten()
        else:
            axes = axes.flatten()
        
        for idx, (ax, step) in enumerate(zip(axes[:n_steps], key_steps)):
            self._plot_step(ax, step, idx + 1)
        
        # Hide unused subplots
        for idx in range(n_steps, len(axes)):
            axes[idx].set_visible(False)
        
        plt.suptitle(f'{self.algorithm_name} Visualization', fontsize=16, fontweight='bold')
        plt.tight_layout()
        
        plt.savefig(output_path, dpi=DPI, bbox_inches='tight')
        plt.close('all')
        
        return output_path
    
    def _select_key_steps(self) -> List[Dict]:
        """Select key steps to avoid overcrowding."""
        key_phases = {'initial', 'divide', 'merge', 'final'}
        return [s for s in self.steps if s['phase'] in key_phases]
    
    def _plot_step(self, ax, step: Dict, step_num: int):
        """Plot a single step."""
        phase = step['phase']
        
        if phase == 'initial':
            arr = step['array']
            x = np.arange(len(arr))
            bars = ax.bar(x, arr, color=COLORS['initial'], alpha=0.8, edgecolor='black')
            for bar, val in zip(bars, arr):
                ax.text(bar.get_x() + bar.get_width()/2., bar.get_height(),
                       str(val), ha='center', va='bottom', fontsize=10)
            ax.set_title(f'Step {step_num}: {LABELS["initial"]} {arr}', fontsize=12)
            
        elif phase == 'divide':
            left, right = step['arrays']
            if left:
                x = np.arange(len(left))
                ax.bar(x - 0.2, left, width=0.4, color=COLORS['divide'], 
                      alpha=0.8, label='Left', edgecolor='black')
            if right:
                x = np.arange(len(right))
                offset = len(left) if left else 0
                ax.bar(x + offset + 0.2, right, width=0.4, 
                      color='#e67e22', alpha=0.8, label='Right', edgecolor='black')
            ax.set_title(f'Step {step_num}: {LABELS["divide"]}', fontsize=12)
            ax.legend()
            
        elif phase == 'merge':
            arr = step['array']
            x = np.arange(len(arr))
            colors = [COLORS['merge']] * len(arr)
            for idx in step.get('highlights', []):
                if idx < len(colors):
                    colors[idx] = COLORS['highlight']
            
            bars = ax.bar(x, arr, color=colors, alpha=0.8, edgecolor='black')
            for bar, val in zip(bars, arr):
                ax.text(bar.get_x() + bar.get_width()/2., bar.get_height(),
                       str(val), ha='center', va='bottom', fontsize=10)
            ax.set_title(f'Step {step_num}: {LABELS["merge"]} {arr}', fontsize=12)
            
        elif phase == 'final':
            arr = step['array']
            x = np.arange(len(arr))
            bars = ax.bar(x, arr, color=COLORS['final'], alpha=0.8, edgecolor='black')
            for bar, val in zip(bars, arr):
                ax.text(bar.get_x() + bar.get_width()/2., bar.get_height(),
                       str(val), ha='center', va='bottom', fontsize=11, fontweight='bold')
            ax.set_title(f'Step {step_num}: {LABELS["final"]} {arr}', fontsize=12)
        
        ax.set_ylim(0, max(step.get('array', [0]) or step.get('arrays', [[0]])[0]) * 1.2)
        ax.grid(axis='y', alpha=0.3)


# ============================================================
# EXAMPLE: Merge Sort with Visualization
# ============================================================

def merge_sort_viz(arr: List[int], viz: AlgorithmViz, depth: int = 0) -> List[int]:
    """Merge sort with visualization recording."""
    if len(arr) <= 1:
        return arr
    
    mid = len(arr) // 2
    left = arr[:mid]
    right = arr[mid:]
    
    viz.record_divide(left, right, depth, f'Split at index {mid}')
    
    left_sorted = merge_sort_viz(left, viz, depth + 1)
    right_sorted = merge_sort_viz(right, viz, depth + 1)
    
    merged = merge(left_sorted, right_sorted)
    viz.record_merge(merged, depth, f'Merged: {merged}')
    
    return merged

def merge(left: List[int], right: List[int]) -> List[int]:
    """Merge two sorted arrays."""
    result = []
    i = j = 0
    
    while i < len(left) and j < len(right):
        if left[i] <= right[j]:
            result.append(left[i])
            i += 1
        else:
            result.append(right[j])
            j += 1
    
    result.extend(left[i:])
    result.extend(right[j:])
    return result


# ============================================================
# MAIN
# ============================================================

def main():
    """Demonstrate algorithm visualization."""
    # Test data
    test_array = [38, 27, 43, 3, 9, 82, 10, 25]
    
    print(f"Sorting: {test_array}")
    
    # Create visualizer and run algorithm
    viz = AlgorithmViz("Merge Sort")
    viz.record_initial(test_array)
    
    sorted_array = merge_sort_viz(test_array, viz)
    viz.record_final(sorted_array)
    
    # Generate visualization
    output_path = viz.visualize()
    print(f"Visualization saved to: {output_path}")
    
    print(f"Sorted result: {sorted_array}")


if __name__ == '__main__':
    main()
