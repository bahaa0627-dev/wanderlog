import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:wanderlog/features/collections/data/supabase_collection_repository.dart';

final collectionRepositoryProvider = Provider<SupabaseCollectionRepository>((ref) {
  return SupabaseCollectionRepository();
});

