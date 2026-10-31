ALTER TABLE "geo_business_profiles" ADD CONSTRAINT "geo_business_profiles_offering_length" CHECK (array_to_string("geo_business_profiles"."offerings", E'
') !~ '[^
]{81}');