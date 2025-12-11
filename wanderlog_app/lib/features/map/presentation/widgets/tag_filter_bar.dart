import 'package:flutter/material.dart';

class TagFilterBar extends StatelessWidget {

  const TagFilterBar({
    super.key,
    required this.selectedTags,
    required this.onTagsChanged,
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
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.1),
            blurRadius: 4,
            offset: const Offset(0, 2),
          ),
        ],
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



