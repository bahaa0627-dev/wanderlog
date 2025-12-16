import 'package:flutter/material.dart';
import 'package:wanderlog/core/theme/app_theme.dart';

class TagFilterBar extends StatelessWidget {

  const TagFilterBar({
    required this.selectedTags, required this.onTagsChanged, super.key,
  });
  final List<String> selectedTags;
  final void Function(List<String>) onTagsChanged;

  static const List<String> availableTags = [
    'coffee',
    'museum',
    'architecture',
    'park',
    'restaurant',
    'shopping',
    'nightlife',
    'culture',
    'art',
    'history',
  ];

  @override
  Widget build(BuildContext context) => Container(
      height: 60,
      padding: const EdgeInsets.symmetric(vertical: 8),
      decoration: BoxDecoration(
        color: Colors.white,
        border: Border(
          bottom: BorderSide(
            color: AppTheme.black,
            width: 2,
          ),
        ),
      ),
      child: ListView.builder(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 16),
        itemCount: availableTags.length,
        itemBuilder: (context, index) {
          final tag = availableTags[index];
          final isSelected = selectedTags.contains(tag);

          return Padding(
            padding: const EdgeInsets.only(right: 8),
            child: FilterChip(
              label: Text('#$tag'),
              selected: isSelected,
              onSelected: (selected) {
                final newTags = List<String>.from(selectedTags);
                if (selected) {
                  newTags.add(tag);
                } else {
                  newTags.remove(tag);
                }
                onTagsChanged(newTags);
              },
              selectedColor: Colors.blue.shade100,
              checkmarkColor: Colors.blue.shade700,
            ),
          );
        },
      ),
    );
}






